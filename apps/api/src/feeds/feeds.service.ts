import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import Parser from 'rss-parser';
import { Feed } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_INTERESTS, parseInterests } from '../prefs/interests';
import { scoreAffinity } from '../common/affinity';

export interface FeedDto {
  id: string;
  url: string;
  title: string;
  siteUrl: string | null;
  folderKey: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastFetchStatus: string | null;
  lastError: string | null;
}

export interface FeedAffinity {
  feedId: string;
  score: number;
  sampleSize: number; // artículos recientes evaluados
  recentPerWeek: number; // volumen: artículos de los últimos 7 días
}

const AFFINITY_SAMPLE = 30;

@Injectable()
export class FeedsService {
  private readonly parser = new Parser({ timeout: 15_000 });

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<FeedDto[]> {
    const feeds = await this.prisma.feed.findMany({
      where: { active: true },
      include: { folder: { select: { key: true } } },
      orderBy: [{ folder: { sortOrder: 'asc' } }, { title: 'asc' }],
    });
    return feeds.map((f) => this.toDto(f, f.folder.key));
  }

  /**
   * "Termómetro": afinidad de cada feed activo con tus intereses (según sus
   * artículos recientes) + volumen semanal. Ayuda a decidir qué podar.
   */
  async affinities(): Promise<FeedAffinity[]> {
    const [feeds, pref] = await Promise.all([
      this.prisma.feed.findMany({ where: { active: true }, select: { id: true } }),
      this.prisma.userPref.findUnique({ where: { id: 'singleton' } }),
    ]);
    const terms = parseInterests(pref?.interests) ?? DEFAULT_INTERESTS;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);

    return Promise.all(
      feeds.map(async (feed) => {
        const [arts, recentPerWeek] = await Promise.all([
          this.prisma.article.findMany({
            where: { feedId: feed.id },
            orderBy: { publishedAt: 'desc' },
            take: AFFINITY_SAMPLE,
            select: { title: true, excerpt: true },
          }),
          this.prisma.article.count({ where: { feedId: feed.id, publishedAt: { gte: weekAgo } } }),
        ]);
        const { score } = scoreAffinity(arts.map((a) => ({ title: a.title, extra: a.excerpt })), terms);
        return { feedId: feed.id, score, sampleSize: arts.length, recentPerWeek };
      }),
    );
  }

  /** ESC-11: valida que la URL sea un feed parseable antes de guardar. */
  async create(url: string, folderKey: string): Promise<FeedDto> {
    const folder = await this.prisma.folder.findUnique({ where: { key: folderKey } });
    if (!folder) throw new BadRequestException(`Carpeta desconocida: ${folderKey}`);

    const existing = await this.prisma.feed.findUnique({ where: { url } });
    if (existing) {
      if (existing.active) throw new ConflictException('Ese feed ya existe');
      // Reactivar un feed antes eliminado (soft delete por guardados)
      const revived = await this.prisma.feed.update({
        where: { id: existing.id },
        data: { active: true, folderId: folder.id },
      });
      return this.toDto(revived, folderKey);
    }

    let title: string;
    let siteUrl: string | null;
    try {
      const parsed = await this.parser.parseURL(url);
      title = parsed.title?.trim() || new URL(url).hostname;
      siteUrl = (parsed.link as string | undefined) ?? null;
    } catch {
      throw new BadRequestException('La URL no es un feed RSS/Atom parseable');
    }

    const feed = await this.prisma.feed.create({
      data: { url, title, siteUrl, folderId: folder.id },
    });
    return this.toDto(feed, folderKey);
  }

  /**
   * ESC-11: eliminar un feed borra en cascada sus artículos NO guardados.
   * Si quedan guardados (nunca se purgan — RN-06), el feed pasa a inactive
   * para no romper la relación; si no queda ninguno, se borra de verdad.
   */
  async remove(id: string): Promise<{ ok: true }> {
    const feed = await this.prisma.feed.findUnique({ where: { id } });
    if (!feed) throw new NotFoundException('Feed no encontrado');

    await this.prisma.article.deleteMany({ where: { feedId: id, isStarred: false } });
    const starred = await this.prisma.article.count({ where: { feedId: id } });
    if (starred > 0) {
      await this.prisma.feed.update({ where: { id }, data: { active: false } });
    } else {
      await this.prisma.feed.delete({ where: { id } });
    }
    return { ok: true };
  }

  private toDto(feed: Feed, folderKey: string): FeedDto {
    return {
      id: feed.id,
      url: feed.url,
      title: feed.title,
      siteUrl: feed.siteUrl,
      folderKey,
      active: feed.active,
      lastFetchedAt: feed.lastFetchedAt?.toISOString() ?? null,
      lastFetchStatus: feed.lastFetchStatus,
      lastError: feed.lastError,
    };
  }
}
