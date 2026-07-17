import { Injectable, Logger } from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';

export interface ExtractedArticle {
  html: string;
  author: string | null;
  imageUrl: string | null;
}

const FETCH_TIMEOUT_MS = 15_000; // § 3.4
const MAX_HTML_BYTES = 3_000_000; // corta páginas absurdamente grandes

/**
 * ESC-02: extrae el cuerpo completo de un artículo desde su URL usando
 * Readability (server-side). Devuelve null si no se pudo (FE-02 → fallback a excerpt).
 */
@Injectable()
export class ExtractorService {
  private readonly logger = new Logger(ExtractorService.name);

  async extract(url: string): Promise<ExtractedArticle | null> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
        headers: {
          'user-agent':
            'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 SenalReader/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) {
        this.logger.warn(`Extracción falló (${res.status}) para ${url}`);
        return null;
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('html')) return null;

      let html = await res.text();
      if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES);

      // jsdom sin ejecutar scripts; VirtualConsole silencia errores de CSS
      const virtualConsole = new VirtualConsole();
      virtualConsole.on('error', () => undefined);
      const dom = new JSDOM(html, { url, virtualConsole });

      try {
        const meta = this.pickMeta(dom);
        const article = new Readability(dom.window.document).parse();
        if (!article?.content || !article.textContent?.trim()) return null;

        return {
          html: article.content,
          author: article.byline?.trim() || null,
          imageUrl: meta.imageUrl,
        };
      } finally {
        dom.window.close();
      }
    } catch (err) {
      this.logger.warn(`Extracción falló para ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  private pickMeta(dom: JSDOM): { imageUrl: string | null } {
    const doc = dom.window.document;
    const og =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ??
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
    let imageUrl: string | null = null;
    if (og) {
      try {
        const abs = new URL(og, dom.window.location.href).toString();
        if (abs.startsWith('http')) imageUrl = abs;
      } catch {
        imageUrl = null;
      }
    }
    return { imageUrl };
  }
}
