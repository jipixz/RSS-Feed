import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER, AiProvider } from '../ai/provider/ai-provider.interface';
import { DEFAULT_INTERESTS, parseInterests } from '../prefs/interests';
import { SUGGESTED_CATALOG, SuggestedFeed } from '../feeds/suggested-catalog';

const SAMPLE_COUNT = 5;

const VERDICT_SYSTEM = `Eres un asistente que evalúa si una fuente RSS encaja con los intereses de un lector desarrollador.
Con base en los títulos de muestra y los intereses, responde SOLO con una frase breve en español (máx. 25 palabras)
que describa el tipo de contenido y qué tanto encaja. No decidas por el usuario ni digas "deberías"; solo describe.`;

export interface SuggestedItem extends SuggestedFeed {
  added: boolean;
}

export interface AnalyzeResult {
  score: number; // 0–100, afinidad por palabras clave (transparente, sin IA)
  matched: string[]; // intereses que aparecieron
  sampleTitles: string[];
  verdict: string | null; // opinión de la IA (null si desactivada o falló)
  aiEnabled: boolean;
}

@Injectable()
export class DiscoverService {
  private readonly logger = new Logger(DiscoverService.name);
  private readonly parser = new Parser({ timeout: 15_000 });

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  /** Catálogo agrupado por carpeta, marcando lo que ya tienes. */
  async suggested(): Promise<{ groups: { folderLabel: string; feeds: SuggestedItem[] }[] }> {
    const existing = new Set((await this.prisma.feed.findMany({ select: { url: true } })).map((f) => f.url));
    const groups = new Map<string, SuggestedItem[]>();
    for (const feed of SUGGESTED_CATALOG) {
      const item: SuggestedItem = { ...feed, added: existing.has(feed.url) };
      if (!groups.has(feed.folderLabel)) groups.set(feed.folderLabel, []);
      groups.get(feed.folderLabel)!.push(item);
    }
    return { groups: [...groups.entries()].map(([folderLabel, feeds]) => ({ folderLabel, feeds })) };
  }

  /** Analiza un feed: afinidad (keywords) + opinión de la IA (asesora, no decide). */
  async analyze(url: string): Promise<AnalyzeResult> {
    let items: { title?: string; contentSnippet?: string; summary?: string }[];
    try {
      const parsed = await this.parser.parseURL(url);
      items = (parsed.items ?? []).slice(0, SAMPLE_COUNT);
    } catch {
      throw new BadRequestException('No se pudo leer el feed (¿URL válida y parseable?)');
    }
    if (items.length === 0) throw new BadRequestException('El feed no tiene artículos para analizar');

    const pref = await this.prisma.userPref.findUnique({ where: { id: 'singleton' } });
    const interests = parseInterests(pref?.interests) ?? DEFAULT_INTERESTS;
    const terms = interests.map((t) => t.toLowerCase().trim()).filter(Boolean);

    const sampleTitles = items.map((i) => (i.title ?? '').trim()).filter(Boolean);

    // Afinidad determinista por palabras clave (transparente, gratis)
    let matchedSamples = 0;
    let totalHits = 0;
    const matched = new Set<string>();
    for (const it of items) {
      const hay = `${it.title ?? ''} ${it.contentSnippet ?? it.summary ?? ''}`.toLowerCase();
      let hit = false;
      for (const term of terms) {
        if (hay.includes(term)) { totalHits += 1; matched.add(term); hit = true; }
      }
      if (hit) matchedSamples += 1;
    }
    const coverage = items.length ? matchedSamples / items.length : 0;
    const density = items.length ? Math.min(1, totalHits / (items.length * 2)) : 0;
    const score = Math.round((coverage * 0.7 + density * 0.3) * 100);

    // Opinión de la IA (nunca bloquea — FE-03)
    let verdict: string | null = null;
    if (this.provider.isEnabled()) {
      try {
        const user = `Intereses del lector: ${interests.slice(0, 40).join(', ')}\n\nTítulos recientes de la fuente:\n- ${sampleTitles.join('\n- ')}`;
        const res = await this.provider.chat(VERDICT_SYSTEM, user, { maxTokens: 120 });
        verdict = res.text;
      } catch (err) {
        this.logger.warn(`Veredicto IA falló para ${url}: ${(err as Error).message}`);
      }
    }

    return { score, matched: [...matched], sampleTitles, verdict, aiEnabled: this.provider.isEnabled() };
  }
}
