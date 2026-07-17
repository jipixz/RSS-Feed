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
}
