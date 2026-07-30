import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

const CENTROID_TTL_MS = 15 * 60_000; // recalcular centroides cada 15 min
const MIN_PER_FOLDER = 5; // no formar centroide de una carpeta con muy pocos ejemplos

/**
 * Categorización por CONTENIDO (no por fuente): construye un "centroide" por
 * carpeta = promedio de los embeddings de sus artículos, y clasifica cada
 * artículo a la carpeta cuyo centroide es el más cercano (coseno). Así un
 * artículo de un feed "dev" que en realidad habla de seguridad queda etiquetado
 * como seguridad. Se apoya en los embeddings ya calculados (CPU, sin tocar el LLM).
 */
@Injectable()
export class CategorizationService {
  private readonly logger = new Logger(CategorizationService.name);
  private centroids: { at: number; map: Map<string, number[]> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /** Centroide (vector promedio) por carpeta, cacheado. */
  async getCentroids(force = false): Promise<Map<string, number[]>> {
    if (!force && this.centroids && Date.now() - this.centroids.at < CENTROID_TTL_MS) {
      return this.centroids.map;
    }
    const rows = await this.prisma.article.findMany({
      where: { embedding: { not: null } },
      select: { embedding: true, feed: { select: { folder: { select: { key: true } } } } },
    });

    const acc = new Map<string, { sum: number[]; n: number }>();
    for (const r of rows) {
      if (!r.embedding) continue;
      let v: number[];
      try {
        v = JSON.parse(r.embedding) as number[];
      } catch {
        continue;
      }
      const key = r.feed.folder.key;
      const cur = acc.get(key);
      if (!cur) {
        acc.set(key, { sum: [...v], n: 1 });
      } else {
        for (let i = 0; i < v.length; i++) cur.sum[i] += v[i];
        cur.n += 1;
      }
    }

    const map = new Map<string, number[]>();
    for (const [key, { sum, n }] of acc) {
      if (n < MIN_PER_FOLDER) continue; // pocos ejemplos → centroide poco confiable
      map.set(key, sum.map((x) => x / n));
    }
    this.centroids = { at: Date.now(), map };
    return map;
  }

  /** Carpeta cuyo centroide es más cercano al vector (o null si no hay centroides). */
  classify(vec: number[], centroids: Map<string, number[]>): { key: string; score: number } | null {
    let best: { key: string; score: number } | null = null;
    for (const [key, c] of centroids) {
      const score = EmbeddingService.cosine(vec, c);
      if (!best || score > best.score) best = { key, score };
    }
    return best;
  }

  /**
   * Asigna topicKey a los artículos que tienen embedding pero aún no tema.
   * Corre en segundo plano al final de la ingesta (tras calcular embeddings).
   */
  async tagPending(limit = 300): Promise<number> {
    if (!this.embeddings.isEnabled()) return 0;
    const centroids = await this.getCentroids();
    if (centroids.size < 2) return 0; // se necesitan ≥2 temas para clasificar

    const rows = await this.prisma.article.findMany({
      where: { embedding: { not: null }, topicKey: null },
      take: limit,
      select: { id: true, embedding: true },
    });
    let n = 0;
    for (const r of rows) {
      if (!r.embedding) continue;
      let v: number[];
      try {
        v = JSON.parse(r.embedding) as number[];
      } catch {
        continue;
      }
      const best = this.classify(v, centroids);
      if (!best) continue;
      await this.prisma.article.update({ where: { id: r.id }, data: { topicKey: best.key } }).catch(() => undefined);
      n += 1;
    }
    if (n) this.logger.log(`Categorización por contenido: ${n} artículos etiquetados`);
    return n;
  }
}
