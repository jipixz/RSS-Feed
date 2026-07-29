import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../ai/embedding.service';
import { excludeMutesWhere } from '../common/mute-filter';
import { dotColorFor } from '../common/folder-colors';
import { ListArticlesQueryDto } from './dto/list-articles.dto';

const listSelect = {
  id: true,
  title: true,
  excerpt: true,
  tldr: true,
  publishedAt: true,
  fetchedAt: true,
  isRead: true,
  isStarred: true,
  imageUrl: true,
  wordCount: true,
  feed: { select: { title: true, folder: { select: { key: true } } } },
} satisfies Prisma.ArticleSelect;

/** ~220 palabras por minuto de lectura. */
export function readingMinutes(wordCount: number | null): number | null {
  if (!wordCount || wordCount < 50) return null;
  return Math.max(1, Math.round(wordCount / 220));
}

type ListRow = Prisma.ArticleGetPayload<{ select: typeof listSelect }>;

export interface ArticleListItem {
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
}

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /** Toma ids rankeados y devuelve los ArticleListItem en ese mismo orden (sin muteados). */
  private async listByRankedIds(ranked: { id: string; score: number }[]): Promise<ArticleListItem[]> {
    if (ranked.length === 0) return [];
    const ids = ranked.map((r) => r.id);
    const mutes = await this.muteTerms();
    const rows = await this.prisma.article.findMany({
      where: { AND: [{ id: { in: ids } }, excludeMutesWhere(mutes)] },
      select: listSelect,
    });
    const byId = new Map(rows.map((r) => [r.id, this.toListItem(r)]));
    return ids.map((id) => byId.get(id)).filter((x): x is ArticleListItem => !!x);
  }

  /** Búsqueda SEMÁNTICA: por significado, no por texto literal. `semantic:false`
   *  si los embeddings no están disponibles (el front cae a la búsqueda normal). */
  async semanticSearch(q: string): Promise<{ items: ArticleListItem[]; semantic: boolean }> {
    const qv = await this.embeddings.embed(`search_query: ${q}`);
    if (!qv) return { items: [], semantic: false };
    const ranked = await this.embeddings.rank(qv, { limit: 40 });
    return { items: await this.listByRankedIds(ranked), semantic: true };
  }

  /** Artículos relacionados por cercanía semántica (para el pie del artículo). */
  async related(id: string, limit = 5): Promise<ArticleListItem[]> {
    const art = await this.prisma.article.findUnique({
      where: { id },
      select: { embedding: true, title: true, excerpt: true },
    });
    if (!art) throw new NotFoundException('Artículo no encontrado');
    let vec: number[] | null = null;
    if (art.embedding) {
      try {
        vec = JSON.parse(art.embedding) as number[];
      } catch {
        /* recalcula abajo */
      }
    }
    // si aún no tiene embedding (artículo viejo), lo calcula al vuelo (CPU ~50 ms)
    if (!vec) vec = await this.embeddings.embed(`search_document: ${art.title}. ${art.excerpt}`);
    if (!vec) return [];
    const ranked = await this.embeddings.rank(vec, { limit, excludeId: id });
    return this.listByRankedIds(ranked);
  }

  private async muteTerms(): Promise<string[]> {
    const mutes = await this.prisma.mute.findMany({ select: { term: true } });
    return mutes.map((m) => m.term);
  }

  /** Filtros de alcance (carpeta/guardados/no-leídos/búsqueda) sin mutes. */
  private scopeWhere(query: ListArticlesQueryDto): Prisma.ArticleWhereInput {
    const where: Prisma.ArticleWhereInput = {};
    if (query.saved) {
      where.isStarred = true; // ESC-07: guardados sin importar carpeta
    } else if (query.folder) {
      where.feed = { folder: { key: query.folder } };
    }
    if (query.unreadOnly) where.isRead = false; // ESC-09
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        // ESC-08: title + source + excerpt
        { title: { contains: q } },
        { excerpt: { contains: q } },
        { feed: { title: { contains: q } } },
      ];
    }
    return where;
  }

  async list(query: ListArticlesQueryDto) {
    const mutes = await this.muteTerms();
    const scope = this.scopeWhere(query);
    const where: Prisma.ArticleWhereInput = { AND: [scope, excludeMutesWhere(mutes)] };

    const [rows, visibleCount, totalCount] = await Promise.all([
      this.prisma.article.findMany({
        where,
        select: listSelect,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.article.count({ where }),
      this.prisma.article.count({ where: scope }),
    ]);

    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map((row) => this.toListItem(row));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hiddenByMutes: totalCount - visibleCount, // ESC-04
    };
  }

  async detail(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: { feed: { select: { title: true, folder: { select: { key: true } } } } },
    });
    if (!article) throw new NotFoundException('Artículo no encontrado');

    return {
      ...this.toListItem(article),
      link: article.link,
      author: article.author,
      fullContent: article.fullContent, // ya sanitizado al persistir (RS-3)
      contentStatus: article.contentStatus,
      tldrStatus: article.tldrStatus,
    };
  }

  /** ESC-06 / RN-07: idempotente. */
  async setRead(id: string, read: boolean) {
    await this.ensureExists(id);
    await this.prisma.article.update({
      where: { id },
      data: read ? { isRead: true, readAt: new Date() } : { isRead: false, readAt: null },
    });
    return { ok: true as const };
  }

  /** ESC-07 / RN-07: idempotente. */
  async setStar(id: string, starred: boolean) {
    await this.ensureExists(id);
    await this.prisma.article.update({
      where: { id },
      data: starred ? { isStarred: true, starredAt: new Date() } : { isStarred: false, starredAt: null },
    });
    return { ok: true as const };
  }

  /** ESC-12: marca todo lo visible del scope (respeta mutes). */
  async markAllRead(folder?: string) {
    const mutes = await this.muteTerms();
    const scope: Prisma.ArticleWhereInput = folder ? { feed: { folder: { key: folder } } } : {};
    const result = await this.prisma.article.updateMany({
      where: { AND: [scope, excludeMutesWhere(mutes), { isRead: false }] },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.article.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Artículo no encontrado');
  }

  private toListItem(row: ListRow): ArticleListItem {
    return {
      id: row.id,
      source: row.feed.title,
      folderKey: row.feed.folder.key,
      dotColor: dotColorFor(row.feed.folder.key),
      title: row.title,
      excerpt: row.excerpt,
      tldr: row.tldr,
      imageUrl: row.imageUrl,
      publishedAt: (row.publishedAt ?? row.fetchedAt).toISOString(),
      isRead: row.isRead,
      isStarred: row.isStarred,
      readingMinutes: readingMinutes(row.wordCount),
    };
  }
}
