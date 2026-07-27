import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../ai/embedding.service';
import { excludeMutesWhere } from '../common/mute-filter';
import { dotColorFor } from '../common/folder-colors';
import { readingMinutes } from '../articles/articles.service';
import { DEFAULT_INTERESTS, parseInterests } from '../prefs/interests';

export interface DigestItem {
  id: string;
  source: string;
  folderKey: string;
  dotColor: string;
  title: string;
  excerpt: string;
  tldr: string | null;
  imageUrl: string | null;
  publishedAt: string;
  isRead: boolean;
  isStarred: boolean;
  readingMinutes: number | null;
  score: number;
}

const CANDIDATE_LIMIT = 400;

/** Normaliza un título para detectar la misma noticia entre fuentes distintas. */
function dedupeKey(title: string, link: string): string {
  const t = title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (t.length >= 12) return `t:${t}`;
  // títulos muy cortos/ambiguos: cae al link normalizado (mismo artículo externo)
  const l = link.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  return `l:${l}`;
}

/**
 * Vista "Hoy": artículos de las últimas N horas rankeados por relevancia al
 * perfil de intereses del usuario (UserPref.interests). Scoring por keywords:
 * match en título ×3, TL;DR ×2, excerpt/fuente ×1. Determinista y gratis —
 * no gasta presupuesto de IA.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  // vector del perfil de intereses, cacheado por la firma de intereses
  private profileCache: { key: string; vector: number[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /** Vector del perfil de intereses (cacheado). null si embeddings desactivados. */
  private async profileVector(interests: string[]): Promise<number[] | null> {
    if (!this.embeddings.isEnabled()) return null;
    const key = interests.join('|');
    if (this.profileCache?.key === key) return this.profileCache.vector;
    // "search_query:" es el prefijo de tarea que pide nomic-embed-text para
    // comparar una consulta contra documentos (mejora mucho la separación).
    const prompt = `search_query: temas de interés de un desarrollador de software: ${interests.join(', ')}.`;
    // timeout corto: no bloqueamos "Hoy" si el modelo está frío; tras el 1er ciclo
    // de ingesta queda caliente (keep_alive) y esta llamada es instantánea.
    const vector = await this.embeddings.embed(prompt, 12_000);
    if (vector) this.profileCache = { key, vector };
    return vector;
  }

  /** Lee (sin calcular) los embeddings ya guardados. El cómputo va en segundo
   * plano durante la ingesta (EmbeddingService.embedPending), no en este request. */
  private readEmbeddings(
    rows: { id: string; embedding: string | null }[],
  ): Map<string, number[]> {
    const map = new Map<string, number[]>();
    for (const row of rows) {
      if (!row.embedding) continue;
      try {
        map.set(row.id, JSON.parse(row.embedding) as number[]);
      } catch {
        /* JSON corrupto → se ignora, cae a keyword para ese item */
      }
    }
    return map;
  }

  async digest(hours: number): Promise<{ items: DigestItem[]; interests: string[] }> {
    const [pref, mutes] = await Promise.all([
      this.prisma.userPref.findUnique({ where: { id: 'singleton' } }),
      this.prisma.mute.findMany({ select: { term: true } }),
    ]);
    const interests = parseInterests(pref?.interests) ?? DEFAULT_INTERESTS;
    const cutoff = new Date(Date.now() - hours * 3600_000);

    const rows = await this.prisma.article.findMany({
      where: {
        AND: [{ publishedAt: { gte: cutoff } }, excludeMutesWhere(mutes.map((m) => m.term))],
      },
      orderBy: { publishedAt: 'desc' },
      take: CANDIDATE_LIMIT,
      select: {
        id: true, title: true, excerpt: true, tldr: true, imageUrl: true, link: true, contentStatus: true,
        publishedAt: true, fetchedAt: true, isRead: true, isStarred: true, wordCount: true, embedding: true,
        feed: { select: { title: true, folder: { select: { key: true } } } },
      },
    });

    // Relevancia SEMÁNTICA (si hay embeddings): compara el significado del
    // artículo contra el perfil de intereses. Cae a keywords si está apagado.
    const profile = await this.profileVector(interests);
    const vectors = profile ? this.readEmbeddings(rows) : new Map<string, number[]>();

    const terms = interests.map((t) => t.toLowerCase()).filter(Boolean);
    const scored = rows.map((row) => {
      const title = row.title.toLowerCase();
      const tldr = (row.tldr ?? '').toLowerCase();
      const rest = `${row.excerpt} ${row.feed.title}`.toLowerCase();
      let keyword = 0;
      for (const term of terms) {
        if (title.includes(term)) keyword += 3;
        if (tldr.includes(term)) keyword += 2;
        if (rest.includes(term)) keyword += 1;
      }
      // score de presentación (0–100 si hay semántica; entero de keywords si no)
      const vec = vectors.get(row.id);
      const score =
        profile && vec ? Math.round(EmbeddingService.cosine(profile, vec) * 100) : keyword;
      return {
        row,
        key: dedupeKey(row.title, row.link),
        score,
        keyword, // desempate cuando el score semántico empata
        // señales de "mejor versión" de una misma noticia
        full: row.contentStatus === 'full',
        hasTldr: !!row.tldr,
        published: (row.publishedAt ?? row.fetchedAt).toISOString(),
      };
    });

    // Ordenar por CALIDAD primero para que, entre duplicados, la primera que se
    // conserva sea la mejor: relevancia → keyword → contenido completo → TL;DR → más nueva.
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        b.keyword - a.keyword ||
        Number(b.full) - Number(a.full) ||
        Number(b.hasTldr) - Number(a.hasTldr) ||
        b.published.localeCompare(a.published),
    );

    // Dedupe: misma noticia en Lobsters/HN/Hacker News → se queda una sola.
    const seen = new Set<string>();
    const items = scored
      .filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true)))
      .map(({ row, score, published }) => ({
        id: row.id,
        source: row.feed.title,
        folderKey: row.feed.folder.key,
        dotColor: dotColorFor(row.feed.folder.key),
        title: row.title,
        excerpt: row.excerpt,
        tldr: row.tldr,
        imageUrl: row.imageUrl,
        publishedAt: published,
        isRead: row.isRead,
        isStarred: row.isStarred,
        readingMinutes: readingMinutes(row.wordCount),
        score,
      }))
      // presentación final: relevancia y, a igual score, la más reciente
      .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt));

    return { items, interests };
  }
}
