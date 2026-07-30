import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Embeddings para la relevancia semántica de la vista "Hoy".
 *
 * Usa un modelo de embeddings de Ollama (EMBED_MODEL, default nomic-embed-text)
 * — independiente del LLM de los TL;DR (gemma), así que no le quita consistencia
 * ni memoria caliente. Convierte texto en un vector que captura el *significado*;
 * artículos con tema parecido dan vectores cercanos (similitud coseno alta).
 *
 * Degrada con gracia: si Ollama no es el proveedor, el modelo no está descargado
 * o falla, devuelve null y la vista "Hoy" cae al ranking por palabras clave.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly numGpu: number; // capas en GPU; 0 = CPU (no le quita VRAM al LLM)
  private readonly on: boolean;
  private warned = false;
  // Si Ollama no responde, no reintentamos por un rato: evita que "Hoy" y la
  // ingesta acumulen esperas largas cuando la PC del modelo está caída/saturada.
  private cooldownUntil = 0;
  private static readonly COOLDOWN_MS = 60_000;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseUrl = (config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.get<string>('EMBED_MODEL') ?? 'nomic-embed-text';
    // Por defecto CPU (num_gpu=0): nomic es diminuto y así no compite por la VRAM
    // con el LLM de los TL;DR. Sube EMBED_NUM_GPU si tienes GPU de sobra.
    this.numGpu = Number(config.get<string>('EMBED_NUM_GPU') ?? '0');
    // Solo tiene sentido con Ollama; con anthropic/none se usa el ranking por keywords.
    this.on = (config.get<string>('AI_PROVIDER') ?? 'none').toLowerCase() === 'ollama';
  }

  isEnabled(): boolean {
    return this.on;
  }

  /** Vector del texto, o null si está desactivado o falla (nunca lanza). */
  async embed(text: string, timeoutMs = 90_000): Promise<number[] | null> {
    if (!this.on) return null;
    if (Date.now() < this.cooldownUntil) return null; // Ollama caído recientemente
    const input = text.trim().slice(0, 4_000);
    if (!input) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        // frío puede tardar (carga el modelo + contención de VRAM con el LLM);
        // keep_alive lo deja caliente para el resto del lote.
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: input,
          keep_alive: '30m',
          options: { num_gpu: this.numGpu }, // 0 = CPU, deja la GPU libre para el LLM
        }),
      });
      if (!res.ok) {
        this.warnOnce(`Ollama /api/embeddings respondió ${res.status} (¿corriste "ollama pull ${this.model}"?)`);
        return null;
      }
      const data = (await res.json()) as { embedding?: number[] };
      return Array.isArray(data.embedding) && data.embedding.length ? data.embedding : null;
    } catch (err) {
      this.cooldownUntil = Date.now() + EmbeddingService.COOLDOWN_MS;
      this.warnOnce(`Embeddings no disponibles (${(err as Error).message})`);
      return null;
    }
  }

  /**
   * Calcula y persiste embeddings de artículos recientes que aún no lo tengan.
   * Corre en segundo plano (fin de cada ciclo de ingesta), fuera del request de
   * "Hoy", para que la contención de VRAM con el LLM no bloquee al usuario.
   */
  async embedPending(limit = 120): Promise<number> {
    if (!this.on) return 0;
    const pending = await this.prisma.article.findMany({
      where: { embedding: null },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: { id: true, title: true, excerpt: true },
    });
    let done = 0;
    for (const a of pending) {
      // "search_document:" es el prefijo de tarea que pide nomic-embed-text
      const vec = await this.embed(`search_document: ${a.title}. ${a.excerpt}`);
      if (!vec) break; // embeddings caídos: reintenta el próximo ciclo
      await this.prisma.article
        .update({ where: { id: a.id }, data: { embedding: JSON.stringify(vec) } })
        .catch(() => undefined);
      done += 1;
    }
    if (done) this.logger.log(`Embeddings calculados en segundo plano: ${done}`);
    return done;
  }

  /**
   * Rankea artículos con embedding por similitud coseno contra un vector de
   * consulta. Base de la búsqueda semántica y de "artículos relacionados".
   */
  async rank(query: number[], opts: { limit: number; excludeId?: string }): Promise<{ id: string; score: number }[]> {
    const rows = await this.prisma.article.findMany({
      where: { embedding: { not: null } },
      select: { id: true, embedding: true },
    });
    const scored: { id: string; score: number }[] = [];
    for (const r of rows) {
      if (r.id === opts.excludeId || !r.embedding) continue;
      let v: number[];
      try {
        v = JSON.parse(r.embedding) as number[];
      } catch {
        continue;
      }
      scored.push({ id: r.id, score: EmbeddingService.cosine(query, v) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, opts.limit);
  }

  /** Ping barato para mantener el modelo cargado (keep_alive) entre ciclos de
   *  ingesta, y así la 1ª búsqueda/relacionados del usuario no pague cold-start. */
  async warm(): Promise<void> {
    if (!this.on) return;
    await this.embed('search_query: keepalive');
  }

  private warnOnce(msg: string) {
    if (this.warned) return;
    this.warned = true;
    this.logger.warn(`${msg} — la vista "Hoy" usará ranking por palabras clave`);
  }

  /** Similitud coseno entre dos vectores (−1..1). */
  static cosine(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom ? dot / denom : 0;
  }
}
