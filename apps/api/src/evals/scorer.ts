/**
 * Verificador determinista de los TL;DR. Sin LLM y sin red: por eso puede
 * correr en CI y dar siempre el mismo resultado sobre las mismas salidas.
 *
 * Mide dos cosas opuestas, que es la gracia:
 *  1. Que un resumen de algo NO confirmado conserve la atribución.
 *  2. Que un resumen de un hecho confirmado NO se llene de matices.
 */

export type Label = 'attributed' | 'factual';

/**
 * Límites de palabra que respetan acentos y ñ.
 * En JavaScript `\b` se apoya en [A-Za-z0-9_], así que /\breportó\b/ NO casa con
 * "reportó": la "ó" no es carácter de palabra y el límite derecho nunca se
 * cumple. Con \p{L} y lookarounds sí funciona en español.
 */
const word = (...alternatives: string[]) =>
  new RegExp(`(?<![\\p{L}])(?:${alternatives.join('|')})(?![\\p{L}])`, 'iu');

/**
 * Marcadores de INCERTIDUMBRE sobre el hecho en sí. En un artículo de hecho
 * confirmado, cualquiera de estos sobra (hedging indebido).
 * Ojo: "podría/puede" en presente queda fuera a propósito, porque suele
 * describir capacidad técnica ("una falla que podría permitir RCE") y no duda.
 */
const UNCERTAINTY = [
  word('presunt(?:o|a|os|as|amente)'),
  word('supuest(?:o|a|os|as|amente)'),
  word('al parecer'),
  word('aparentemente'),
  word('se cree'),
  word('habrían?'),
  word('pud(?:o|ieron)'), // "pudo exponer", "pudieron acceder": posibilidad, no hecho
  word('podrían? haber'),
  word('posiblemente'),
  word('probablemente'),
  word('no (?:está|han sido) confirmad(?:o|a|os|as)'),
  word('sin confirmar'),
  word('no se ha confirmado'),
];

/**
 * Marcadores de ATRIBUCIÓN A UNA FUENTE. En un hecho confirmado son legítimos
 * ("según CISA, está siendo explotada"), por eso no cuentan como hedging.
 */
const SOURCING = [
  word('según'),
  word('de acuerdo con'),
  word('report(?:a|an|ó|aron|ado|ados|ada|adas)'),
  word('investiga(?:n|ba|ron)?'),
  word('investigación'),
  word('atribuy(?:e|en|ó|eron)'),
  word('acus(?:a|an|ó|aron|ado|ados|ada|adas|ación|aciones)'),
  word('aleg(?:a|an|ó|aron|ado|ados)'),
  word('sospech(?:a|an|ó|oso|osa|osos|osas)'),
  word('sugier(?:e|en)'),
  word('sugiri(?:ó|eron)'),
  word('indican? que'),
  word('apuntan? a que'),
  word('afirman? que'),
  word('señalan? que'),
  word('asegur(?:a|an) que'),
];

/** Preámbulos que el prompt prohíbe explícitamente. */
const PREAMBLE = /^\s*(aquí (está|tienes)|el (siguiente )?resumen|resumen\s*:|en resumen|claro[,.])/i;

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function hasUncertainty(text: string): boolean {
  return UNCERTAINTY.some((re) => re.test(text));
}

export function hasSourcing(text: string): boolean {
  return SOURCING.some((re) => re.test(text));
}

/** Conserva el grado de certeza: o atribuye a una fuente, o marca la duda. */
export function preservesAttribution(text: string): boolean {
  return hasSourcing(text) || hasUncertainty(text);
}

export interface CaseScore {
  pass: boolean;
  words: number;
  withinLimit: boolean;
  preamble: boolean;
  /** Solo en `attributed`: conservó la atribución. */
  attribution?: boolean;
  /** Solo en `factual`: metió matices que el original no tiene. */
  falseHedge?: boolean;
}

export const WORD_LIMIT = 45;

export function scoreOne(summary: string, label: Label): CaseScore {
  const words = countWords(summary);
  const withinLimit = words <= WORD_LIMIT;
  const preamble = PREAMBLE.test(summary);

  if (label === 'attributed') {
    const attribution = preservesAttribution(summary);
    return { pass: attribution, words, withinLimit, preamble, attribution };
  }
  const falseHedge = hasUncertainty(summary);
  return { pass: !falseHedge, words, withinLimit, preamble, falseHedge };
}

export interface Aggregate {
  n: number;
  nAttributed: number;
  nFactual: number;
  /** Casos `attributed` que conservan la atribución. Métrica principal. */
  attributionRate: number;
  /** Casos `factual` que metieron matices indebidos. Efecto secundario. */
  falseHedgeRate: number;
  lengthCompliance: number;
  preambleRate: number;
  avgWords: number;
}

export function aggregate(results: { label: Label; score: CaseScore }[]): Aggregate {
  const attributed = results.filter((r) => r.label === 'attributed');
  const factual = results.filter((r) => r.label === 'factual');
  const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den);

  return {
    n: results.length,
    nAttributed: attributed.length,
    nFactual: factual.length,
    attributionRate: ratio(attributed.filter((r) => r.score.attribution).length, attributed.length),
    falseHedgeRate: ratio(factual.filter((r) => r.score.falseHedge).length, factual.length),
    lengthCompliance: ratio(results.filter((r) => r.score.withinLimit).length, results.length),
    preambleRate: ratio(results.filter((r) => r.score.preamble).length, results.length),
    avgWords: results.length ? results.reduce((s, r) => s + r.score.words, 0) / results.length : 0,
  };
}
