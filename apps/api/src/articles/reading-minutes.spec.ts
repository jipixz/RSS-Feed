// readingMinutes(wordCount) estima minutos de lectura (~220 palabras/min).
// Es una función pura exportada desde articles.service.

import { readingMinutes } from './articles.service';

describe('readingMinutes', () => {
  it('devuelve null si no hay conteo de palabras', () => {
    expect(readingMinutes(null)).toBeNull();
  });

  it('devuelve null para textos muy cortos (<50 palabras)', () => {
    expect(readingMinutes(30)).toBeNull();
  });

  it('redondea a minutos y nunca baja de 1', () => {
    expect(readingMinutes(100)).toBe(1); // 100/220 ≈ 0.45 → mínimo 1
    expect(readingMinutes(220)).toBe(1);
    expect(readingMinutes(2200)).toBe(10);
  });
});
