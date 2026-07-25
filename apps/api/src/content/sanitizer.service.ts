import { Injectable } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

/**
 * RS-3 / FE-06: los feeds son fuente no confiable. Todo HTML se sanitiza
 * antes de persistir (aquí) y otra vez antes de renderizar (DOMPurify en el front).
 */
@Injectable()
export class SanitizerService {
  private readonly options: sanitizeHtml.IOptions = {
    allowedTags: [
      'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
      'a', 'img', 'figure', 'figcaption', 'picture', 'source',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'blockquote', 'pre', 'code', 'kbd', 'samp',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      'div', 'span', 'section', 'article', 'aside',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
      source: ['srcset', 'type', 'media'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
      img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }),
    },
    disallowedTagsMode: 'discard',
  };

  sanitize(html: string): string {
    return sanitizeHtml(html ?? '', this.options).trim();
  }

  /** Texto plano (sin tags) — para mutes, búsqueda y entrada del resumen IA. */
  toText(html: string): string {
    return sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} })
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Texto para TTS: a diferencia de toText(), conserva la estructura como saltos
   * de línea y garantiza que cada bloque termine en puntuación. Así el motor
   * (Kokoro/Piper) hace pausas naturales entre título, párrafos y encabezados en
   * vez de leer todo de corrido.
   */
  toSpeech(html: string): string {
    // los bloques cierran con doble salto (pausa larga); <br> con salto simple
    const withBreaks = (html ?? '')
      .replace(/<\/(p|h[1-6]|li|blockquote|tr|div|section|article|figcaption|dd|dt)>/gi, '.\n\n')
      .replace(/<br\s*\/?>/gi, '\n');
    const stripped = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
    return stripped
      .replace(/[^\S\n]+/g, ' ') // colapsa espacios pero respeta los \n
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (/[.!?:;…]$/.test(l) ? l : `${l}.`)) // cierra cada línea con puntuación
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(\.\s*){2,}/g, '. ') // limpia puntos dobles ("texto..")
      .trim();
  }
}
