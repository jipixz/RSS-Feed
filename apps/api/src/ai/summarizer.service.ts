import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SanitizerService } from '../content/sanitizer.service';
import { AI_PROVIDER, AiProvider } from './provider/ai-provider.interface';
import { AiEventsService } from './ai-events.service';

const MAX_INPUT_CHARS = 8_000; // ~2000 tokens (Anexo B)

export interface SummarizeRunResult {
  summarized: number;
  failed: number;
  tokensUsed: number;
  budgetExhausted: boolean;
}

/**
 * ESC-03: genera TL;DR para artículos pending.
 * RN-04: cada artículo se resume una sola vez.
 * RN-05: máx AI_DAILY_BUDGET resúmenes por día natural; el resto queda pending.
 * FE-03: los fallos nunca bloquean la lectura.
 */
@Injectable()
export class SummarizerService {
  private readonly logger = new Logger(SummarizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sanitizer: SanitizerService,
    private readonly events: AiEventsService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  private get dailyBudget(): number {
    return Number(this.config.get('AI_DAILY_BUDGET') ?? 60);
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async summarizePending(): Promise<SummarizeRunResult> {
    const result: SummarizeRunResult = { summarized: 0, failed: 0, tokensUsed: 0, budgetExhausted: false };

    if (!this.provider.isEnabled()) {
      // Proveedor desactivado: marcar pending como skipped (se leen sin TL;DR)
      await this.prisma.article.updateMany({
        where: { tldrStatus: 'pending' },
        data: { tldrStatus: 'skipped' },
      });
      return result;
    }

    const usedToday = await this.prisma.article.count({
      where: { tldrStatus: 'done', tldrAt: { gte: this.startOfToday() } },
    });
    let remaining = this.dailyBudget - usedToday;
    if (remaining <= 0) {
      result.budgetExhausted = true;
      this.logger.error(`Presupuesto de IA agotado (${this.dailyBudget}/día) — pendientes quedan para mañana (RO-3)`);
      return result;
    }

    const pending = await this.prisma.article.findMany({
      where: { tldrStatus: 'pending' },
      orderBy: { publishedAt: 'desc' },
      take: remaining,
      select: { id: true, title: true, fullContent: true, excerpt: true, feed: { select: { title: true } } },
    });

    const model = this.provider.modelLabel;
    for (const article of pending) {
      const text = this.sanitizer
        .toText(article.fullContent || article.excerpt)
        .slice(0, MAX_INPUT_CHARS);
      if (!text) {
        await this.prisma.article.update({
          where: { id: article.id },
          data: { tldrStatus: 'skipped' },
        });
        continue;
      }
      this.events.emit({
        type: 'start',
        id: article.id,
        title: article.title,
        source: article.feed.title,
        model,
        promptPreview: text.slice(0, 280),
        at: new Date().toISOString(),
      });
      const startedAt = Date.now();
      try {
        const { tldr, tokensUsed } = await this.provider.summarize(article.title, text);
        await this.prisma.article.update({
          where: { id: article.id },
          data: { tldr, tldrStatus: 'done', tldrAt: new Date() },
        });
        result.summarized += 1;
        result.tokensUsed += tokensUsed ?? 0;
        remaining -= 1;
        this.events.emit({
          type: 'done',
          id: article.id,
          title: article.title,
          tldr,
          tokens: tokensUsed,
          ms: Date.now() - startedAt,
          at: new Date().toISOString(),
        });
        if (remaining <= 0) {
          result.budgetExhausted = true;
          break;
        }
      } catch (err) {
        // FE-03: no bloquea — queda pending y se reintenta el próximo ciclo
        result.failed += 1;
        const message = (err as Error).message;
        this.logger.warn(`TL;DR falló para "${article.title}": ${message}`);
        this.events.emit({ type: 'error', id: article.id, title: article.title, message, at: new Date().toISOString() });
        // Si el proveedor no responde (p. ej. la PC con Ollama está apagada),
        // no tiene caso seguir martillando en este ciclo.
        if (result.failed >= 3 && result.summarized === 0) {
          this.logger.warn('Proveedor de IA no disponible — se reintenta en el próximo ciclo (FE-03)');
          break;
        }
      }
    }

    this.events.emit({
      type: 'cycle',
      summarized: result.summarized,
      failed: result.failed,
      budgetLeft: Math.max(0, remaining),
      at: new Date().toISOString(),
    });
    return result;
  }

  /** Re-generación explícita (única excepción a RN-04). */
  async regenerate(articleId: string): Promise<void> {
    await this.prisma.article.update({
      where: { id: articleId },
      data: { tldrStatus: 'pending', tldr: null },
    });
    await this.summarizePending();
  }
}
