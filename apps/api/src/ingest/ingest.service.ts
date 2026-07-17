import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import Parser from 'rss-parser';
import { Feed } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExtractorService } from '../content/extractor.service';
import { SanitizerService } from '../content/sanitizer.service';
import { SummarizerService } from '../ai/summarizer.service';

const FEED_TIMEOUT_MS = 15_000; // § 3.4
const FEED_CONCURRENCY = 5; // RP-2
const FULL_CONTENT_MIN_CHARS = 600; // texto plano mínimo para considerar 'full'
const EXCERPT_MAX_CHARS = 320;

export interface IngestResult {
  feedsFetched: number;
  newArticles: number;
  summarized: number;
  errors: number;
}

interface FeedItem {
  guid?: string;
  link?: string;
  title?: string;
  creator?: string;
  author?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  enclosure?: { url?: string; type?: string };
  'content:encoded'?: string;
}

/**
 * ESC-01/02: ingesta server-side de feeds con dedupe (RN-01), extracción de
 * contenido completo y sanitización (RS-3). Errores por feed no rompen el
 * ciclo (FE-01/FE-04).
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly parser = new Parser<unknown, FeedItem>({
    timeout: FEED_TIMEOUT_MS,
    customFields: { item: ['content:encoded'] },
  });
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: ExtractorService,
    private readonly sanitizer: SanitizerService,
    private readonly summarizer: SummarizerService,
  ) {}

  async ingestAll(): Promise<IngestResult> {
    if (this.running) {
      this.logger.warn('Ingesta ya en curso — se omite este disparo');
      return { feedsFetched: 0, newArticles: 0, summarized: 0, errors: 0 };
    }
    this.running = true;
    const startedAt = new Date();
    const result: IngestResult = { feedsFetched: 0, newArticles: 0, summarized: 0, errors: 0 };
    let tokensUsed = 0;

    try {
      const feeds = await this.prisma.feed.findMany({ where: { active: true } });

      // Concurrencia máx. 5 feeds (RP-2)
      for (let i = 0; i < feeds.length; i += FEED_CONCURRENCY) {
        const batch = feeds.slice(i, i + FEED_CONCURRENCY);
        const outcomes = await Promise.allSettled(batch.map((feed) => this.ingestFeed(feed)));
        for (const outcome of outcomes) {
          if (outcome.status === 'fulfilled') {
            result.feedsFetched += 1;
            result.newArticles += outcome.value;
          } else {
            result.errors += 1;
          }
        }
      }

      // ESC-03: resumir pendientes respetando presupuesto (RN-05)
      const ai = await this.summarizer.summarizePending();
      result.summarized = ai.summarized;
      tokensUsed = ai.tokensUsed;

      return result;
    } finally {
      this.running = false;
      // RO-1: registro del ciclo
      await this.prisma.ingestLog
        .create({
          data: {
            startedAt,
            finishedAt: new Date(),
            feedsFetched: result.feedsFetched,
            newArticles: result.newArticles,
            summarized: result.summarized,
            errors: result.errors,
            tokensUsed: tokensUsed || null,
          },
        })
        .catch((err: Error) => this.logger.error(`No se pudo escribir IngestLog: ${err.message}`));
      this.logger.log(
        JSON.stringify({
          event: 'ingest_cycle',
          ...result,
          tokensUsed,
          durationMs: Date.now() - startedAt.getTime(),
        }),
      );
    }
  }

  /** Ingesta de un feed. Devuelve cuántos artículos nuevos guardó. */
  private async ingestFeed(feed: Feed): Promise<number> {
    try {
      const parsed = await this.parser.parseURL(feed.url);
      let created = 0;

      for (const item of parsed.items ?? []) {
        const saved = await this.ingestItem(feed, item);
        if (saved) created += 1;
      }

      await this.prisma.feed.update({
        where: { id: feed.id },
        data: {
          lastFetchedAt: new Date(),
          lastFetchStatus: 'ok',
          lastError: null,
          errorStreak: 0,
          // El título del feed puede afinar el seed genérico
          title: parsed.title?.trim() || feed.title,
          siteUrl: feed.siteUrl ?? (parsed.link as string | undefined) ?? null,
        },
      });
      return created;
    } catch (err) {
      // FE-01/FE-04: registrar y continuar, sin romper el ciclo
      const message = (err as Error).message?.slice(0, 500) ?? 'error desconocido';
      const streak = feed.errorStreak + 1;
      await this.prisma.feed.update({
        where: { id: feed.id },
        data: {
          lastFetchedAt: new Date(),
          lastFetchStatus: 'error',
          lastError: message,
          errorStreak: streak,
        },
      });
      const log = JSON.stringify({ event: 'feed_error', feed: feed.title, url: feed.url, streak, message });
      // RO-3: alerta si un feed falla más de 3 ciclos seguidos
      if (streak > 3) this.logger.error(log);
      else this.logger.warn(log);
      throw err;
    }
  }

  /** Devuelve true si el ítem era nuevo y se guardó. */
  private async ingestItem(feed: Feed, item: FeedItem): Promise<boolean> {
    const link = item.link?.trim();
    if (!link || !item.title?.trim()) return false;

    // RN-01: guid del feed o sha256(link)
    const guid = item.guid?.trim() || createHash('sha256').update(link).digest('hex');

    const exists = await this.prisma.article.findUnique({
      where: { feedId_guid: { feedId: feed.id, guid } },
      select: { id: true },
    });
    if (exists) return false;

    // ESC-02: ¿el feed ya trae el cuerpo completo?
    const rawFeedContent = item['content:encoded'] || item.content || item.summary || '';
    const feedHtml = this.sanitizer.sanitize(rawFeedContent);
    const feedText = this.sanitizer.toText(rawFeedContent);

    let fullContent = feedHtml;
    let contentStatus: 'full' | 'partial' = feedText.length >= FULL_CONTENT_MIN_CHARS ? 'full' : 'partial';
    let author = item.creator?.trim() || item.author?.trim() || null;
    let imageUrl = item.enclosure?.type?.startsWith('image') ? (item.enclosure.url ?? null) : null;

    if (contentStatus === 'partial') {
      // Feed truncado o solo-link → extraer desde el link (Readability)
      const extracted = await this.extractor.extract(link);
      if (extracted) {
        const html = this.sanitizer.sanitize(extracted.html);
        if (this.sanitizer.toText(html).length >= FULL_CONTENT_MIN_CHARS) {
          fullContent = html;
          contentStatus = 'full';
          author = author ?? extracted.author;
          imageUrl = imageUrl ?? extracted.imageUrl;
        } else if (html.length > fullContent.length) {
          fullContent = html; // mejor que nada, pero sigue partial (FE-02)
        }
      }
    }

    const excerpt = (this.sanitizer.toText(item.contentSnippet || item.summary || '') || feedText || this.sanitizer.toText(fullContent))
      .slice(0, EXCERPT_MAX_CHARS);

    const publishedAt = this.parseDate(item.isoDate ?? item.pubDate);

    await this.prisma.article.create({
      data: {
        feedId: feed.id,
        guid,
        link,
        title: this.sanitizer.toText(item.title),
        author,
        excerpt,
        fullContent,
        contentStatus,
        imageUrl,
        publishedAt,
        tldrStatus: 'pending',
      },
    });
    return true;
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
