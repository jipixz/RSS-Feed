/**
 * Variantes de prompt para el experimento de longitud vs atribución.
 *
 * El comparativo de modelos (evals/MODELS.md) dejó una pregunta abierta:
 * `qwen2.5-coder:7b` conserva la atribución el 96.7% de las veces contra el
 * 73.3% de `gemma4`, pero escribe 51.4 palabras de media contra 39.8. Las dos
 * métricas no son independientes —condensar es justo lo que tira el matiz— así
 * que la ventaja de qwen podría ser solo el efecto de escribir más largo.
 *
 * Tres brazos para separar dos cosas que se confunden:
 *
 *  - `prod`                 el prompt real, tal cual está en producción.
 *  - `hard-length`          mismo límite de 45 palabras, pero exigido. NO dice
 *                           qué sacrificar: mide si forzar el recorte rompe la
 *                           atribución por sí solo.
 *  - `hard-length-priority` el límite exigido MÁS la regla de qué recortar
 *                           primero. Mide si el prompt puede resolver el
 *                           conflicto en vez de dejar que el modelo elija.
 *
 * Las dos variantes se DERIVAN del prompt de producción en vez de copiarlo,
 * para que no se queden desincronizadas cuando el prompt real cambie. Si la
 * línea que buscan desaparece, esto revienta a propósito: mejor un error que
 * medir calladamente un prompt que no es el que se cree.
 */
import { SUMMARY_SYSTEM_PROMPT } from '../ai/provider/prompt';

/** La línea de longitud del prompt de producción, blanda ("no te pases"). */
const SOFT_LENGTH =
  'Devuelve SOLO el resumen, sin preámbulo, en español, en 1–2 frases (máx. 45 palabras; no te pases).';

/** Mismo objetivo de 45 palabras, pero como límite duro y verificable. */
const HARD_LENGTH =
  'Devuelve SOLO el resumen, sin preámbulo, en español, en 1–2 frases y MÁXIMO 45 PALABRAS. El límite es estricto: cuenta las palabras de tu borrador y, si se pasa, reescríbelo más corto antes de responder.';

/** Qué sacrificar cuando no cabe todo. Deliberadamente ausente en `hard-length`. */
const PRIORITY =
  '\nSi tienes que recortar para entrar en el límite, quita detalle secundario (cifras exactas, nombres de producto, contexto de fondo); nunca quites la marca de duda ni la atribución a la fuente.';

function hardLength(): string {
  if (!SUMMARY_SYSTEM_PROMPT.includes(SOFT_LENGTH)) {
    throw new Error(
      'variants.ts: la línea de longitud del prompt de producción cambió. ' +
        'Actualiza SOFT_LENGTH antes de correr el experimento, o las variantes medirán otra cosa.',
    );
  }
  return SUMMARY_SYSTEM_PROMPT.replace(SOFT_LENGTH, HARD_LENGTH);
}

export interface Variant {
  id: string;
  /** Qué hipótesis prueba este brazo. Va al snapshot y al reporte. */
  tests: string;
  prompt: string;
}

export const VARIANTS: Record<string, Variant> = {
  prod: {
    id: 'prod',
    tests: 'Línea base: el prompt que corre en producción, con el límite blando.',
    prompt: SUMMARY_SYSTEM_PROMPT,
  },
  'hard-length': {
    id: 'hard-length',
    tests: 'Forzar el límite de 45 palabras sin decir qué sacrificar: ¿se cae la atribución al condensar?',
    get prompt() {
      return hardLength();
    },
  },
  'hard-length-priority': {
    id: 'hard-length-priority',
    tests: 'Forzar el límite Y ordenar qué recortar primero: ¿se pueden tener las dos cosas?',
    get prompt() {
      return `${hardLength()}${PRIORITY}`;
    },
  },
};

export const DEFAULT_VARIANT = 'prod';

export function resolveVariant(id: string): Variant {
  const v = VARIANTS[id];
  if (!v) {
    throw new Error(`Variante de prompt desconocida: "${id}". Opciones: ${Object.keys(VARIANTS).join(', ')}`);
  }
  return v;
}
