import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const TIMEOUT_MS = 6_000;
const MAX_QUERY = 200;
const UA = 'SenalReader/1.0 (lector RSS personal)';

export interface DdgResult {
  heading: string | null;
  abstract: string | null;
  source: string | null;
  url: string | null;
  answer: string | null;
  definition: string | null;
  related: { text: string; url: string }[];
}

export interface WikiResult {
  found: boolean;
  lang?: string;
  title?: string;
  extract?: string;
  thumbnail?: string | null;
  url?: string;
  others?: { title: string; url: string }[];
}

/**
 * Búsqueda rápida para la lectura asistida, proxied por el backend (sin CORS ni
 * iframes): DuckDuckGo Instant Answers (respuestas/definiciones, sin API key)
 * y Wikipedia (es→en) para referencia detallada.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  async ddg(rawQ: string): Promise<DdgResult> {
    const q = rawQ.slice(0, MAX_QUERY);
    const res = await this.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=0`,
    );
    const d = (await res.json()) as Record<string, any>;
    const related = ((d.RelatedTopics ?? []) as any[])
      .flatMap((t) => (Array.isArray(t.Topics) ? t.Topics : [t]))
      .filter((t) => t?.Text && t?.FirstURL)
      .slice(0, 6)
      .map((t) => ({ text: String(t.Text), url: String(t.FirstURL) }));
    return {
      heading: d.Heading || null,
      abstract: d.AbstractText || null,
      source: d.AbstractSource || null,
      url: d.AbstractURL || null,
      answer: d.Answer || null,
      definition: d.Definition || null,
      related,
    };
  }

  async wikipedia(rawQ: string): Promise<WikiResult> {
    const q = rawQ.slice(0, MAX_QUERY);
    // Si un idioma falla (red/timeout), se intenta el siguiente en vez de tumbar todo
    const search = async (lang: string): Promise<{ title: string }[]> => {
      try {
        const res = await this.get(
          `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&utf8=1&srlimit=5`,
        );
        const d = (await res.json()) as Record<string, any>;
        return (d?.query?.search ?? []) as { title: string }[];
      } catch {
        return [];
      }
    };

    let lang = 'es';
    let hits = await search(lang);
    if (hits.length === 0) {
      lang = 'en';
      hits = await search(lang);
    }
    if (hits.length === 0) return { found: false };

    const top = hits[0];
    let extract = '';
    let thumbnail: string | null = null;
    let url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(top.title)}`;
    try {
      const sumRes = await this.get(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(top.title)}`,
      );
      const sum = (await sumRes.json()) as Record<string, any>;
      extract = sum.extract ?? '';
      thumbnail = sum.thumbnail?.source ?? null;
      url = sum.content_urls?.desktop?.page ?? url;
    } catch {
      /* sin resumen no es fatal: queda el título + link */
    }

    return {
      found: true,
      lang,
      title: top.title,
      extract,
      thumbnail,
      url,
      others: hits.slice(1, 5).map((h) => ({
        title: h.title,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(h.title)}`,
      })),
    };
  }

  private async get(url: string): Promise<Response> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': UA, accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      this.logger.warn(`Búsqueda falló para ${url}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('La fuente de búsqueda no respondió — intenta de nuevo');
    }
  }
}
