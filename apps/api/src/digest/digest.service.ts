import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
        publishedAt: true, fetchedAt: true, isRead: true, isStarred: true, wordCount: true,
        feed: { select: { title: true, folder: { select: { key: true } } } },
      },
    });

    const terms = interests.map((t) => t.toLowerCase()).filter(Boolean);
    const scored = rows.map((row) => {
      const title = row.title.toLowerCase();
      const tldr = (row.tldr ?? '').toLowerCase();
      const rest = `${row.excerpt} ${row.feed.title}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 3;
        if (tldr.includes(term)) score += 2;
        if (rest.includes(term)) score += 1;
      }
      return {
        row,
        key: dedupeKey(row.title, row.link),
        score,
        // señales de "mejor versión" de una misma noticia
        full: row.contentStatus === 'full',
        hasTldr: !!row.tldr,
        published: (row.publishedAt ?? row.fetchedAt).toISOString(),
      };
    });

    // Ordenar por CALIDAD primero para que, entre duplicados, la primera que se
    // conserva sea la mejor: score → contenido completo → tiene TL;DR → más nueva.
    scored.sort(
      (a, b) =>
        b.score - a.score ||
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
