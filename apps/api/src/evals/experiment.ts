/**
 * Experimento: ¿la ventaja de atribución de qwen es real, o solo escribe largo?
 *
 * Escribe evals/EXPERIMENT-length.md. No llama a ningún modelo: re-puntúa los
 * snapshots de evals/runs/ con el scorer.
 *
 * El comparativo de modelos dejó esta pregunta abierta: `qwen2.5-coder:7b`
 * conserva la atribución 96.7% contra el 73.3% de `gemma4`, pero escribe 51.4
 * palabras contra 39.8. Condensar es justo lo que tira el matiz del original,
 * así que la ventaja podría ser un artefacto de la longitud.
 *
 * Dos ataques al mismo problema:
 *
 *  1. OBSERVACIONAL — dentro de cada modelo, comparar la atribución de los
 *     resúmenes que salieron cortos contra los que salieron largos. Gratis, con
 *     los datos que ya hay. Pero el modelo eligió la longitud, así que no
 *     prueba causalidad: puede que escriba corto precisamente en los artículos
 *     donde la duda es fácil de omitir.
 *
 *  2. INTERVENCIÓN — forzar la longitud por prompt y volver a medir. Eso sí
 *     mueve la longitud sin tocar el artículo, que es lo que hace falta. Dos
 *     brazos: límite duro a secas, y límite duro MÁS la regla de qué recortar
 *     primero.
 *
 * Unidad de análisis: el CASO, no la observación. Las 3 repeticiones del mismo
 * artículo están correlacionadas, así que un intervalo calculado sobre 60
 * observaciones finge una precisión que no existe. Aquí la tasa se promedia por
 * caso y el intervalo se calcula sobre los 20 casos.
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Label, WORD_LIMIT, scoreOne } from './scorer';

const ROOT = join(process.cwd(), '..', '..');
const RUNS = join(ROOT, 'evals', 'runs');
const PROD = 'prod';

interface Snapshot {
  at: string;
  model: string;
  promptVariant?: string;
  repeats: number;
  runs: { id: string; label: Label; split: string; title: string; summaries: string[] }[];
}

interface Obs {
  caseId: string;
  words: number;
  pass: boolean;
  withinLimit: boolean;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pts`;
const rate = (obs: Obs[]) => obs.filter((o) => o.pass).length / obs.length;

/** Tasa de acierto por caso: {caseId -> fraccion de repeticiones que pasaron}. */
function caseRates(obs: Obs[]): Map<string, number> {
  const groups = new Map<string, Obs[]>();
  for (const o of obs) groups.set(o.caseId, [...(groups.get(o.caseId) ?? []), o]);
  return new Map([...groups].map(([id, g]) => [id, g.filter((o) => o.pass).length / g.length]));
}

/** Media e intervalo del 95% de una lista de valores por caso. */
function ci95(values: number[]) {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, halfWidth: n > 1 ? (1.96 * sd) / Math.sqrt(n) : 0 };
}

/**
 * Diferencia PAREADA entre dos brazos: los dos corrieron los mismos 40 casos,
 * asi que comparar caso contra caso elimina la variabilidad entre articulos
 * (que es enorme: unos llevan la duda en un verbo y otros en un adjetivo).
 * El intervalo por brazo suelto es mucho mas ancho y no dejaria concluir nada.
 */
function pairedDelta(variant: Obs[], base: Obs[]) {
  const a = caseRates(variant);
  const b = caseRates(base);
  const diffs = [...a].filter(([id]) => b.has(id)).map(([id, r]) => r - (b.get(id) as number));
  return ci95(diffs);
}

/** Media por caso e intervalo del 95% sobre los casos (no sobre observaciones). */
function byCase(obs: Obs[]) {
  const groups = new Map<string, Obs[]>();
  for (const o of obs) groups.set(o.caseId, [...(groups.get(o.caseId) ?? []), o]);
  const rates = [...groups.values()].map((g) => g.filter((o) => o.pass).length / g.length);
  // con n=20 la aproximación normal es grosera, y así se etiqueta en el reporte.
  const { n, mean, halfWidth } = ci95(rates);
  return { nCases: n, mean, halfWidth };
}

interface Arm {
  file: string;
  model: string;
  variant: string;
  at: string;
  /** Observaciones de los casos `attributed`: donde se mide la atribución. */
  attributed: Obs[];
  /** Todas las observaciones: para longitud y palabras. */
  all: Obs[];
}

function loadArms(): Arm[] {
  const files = readdirSync(RUNS).filter((f) => f.endsWith('.json') && f !== 'latest.json');
  const arms: Arm[] = files
    .map((f) => {
      const snap: Snapshot = JSON.parse(readFileSync(join(RUNS, f), 'utf8'));
      const toObs = (filter?: Label): Obs[] =>
        snap.runs
          .filter((r) => !filter || r.label === filter)
          .flatMap((r) =>
            r.summaries.map((s) => {
              const sc = scoreOne(s, r.label);
              return { caseId: r.id, words: sc.words, pass: sc.pass, withinLimit: sc.withinLimit };
            }),
          );
      return {
        file: f,
        model: snap.model,
        variant: snap.promptVariant ?? PROD,
        at: snap.at,
        attributed: toObs('attributed'),
        all: toObs(),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));

  // Una corrida por combinación modelo+variante: la más reciente.
  const newest = new Map<string, Arm>();
  for (const a of arms) {
    const key = `${a.model}::${a.variant}`;
    if (!newest.has(key)) newest.set(key, a);
  }
  return [...newest.values()];
}

const avgWords = (obs: Obs[]) => obs.reduce((s, o) => s + o.words, 0) / obs.length;
const compliance = (obs: Obs[]) => obs.filter((o) => o.withinLimit).length / obs.length;

function main() {
  const arms = loadArms();
  const models = [...new Set(arms.map((a) => a.model))].sort();
  const variants = [PROD, 'hard-length', 'hard-length-priority'];
  const find = (m: string, v: string) => arms.find((a) => a.model === m && a.variant === v);

  // ---- 1. Observacional: atribución según la longitud que salió
  const strat = models.flatMap((m) => {
    const a = find(m, PROD);
    if (!a) return [];
    return [
      {
        model: m,
        short: a.attributed.filter((o) => o.words <= WORD_LIMIT),
        long: a.attributed.filter((o) => o.words > WORD_LIMIT),
      },
    ];
  });

  const stratRows = strat
    .map(
      (s) =>
        `| \`${s.model}\` | ${s.short.length ? pct(rate(s.short)) : '—'} (n=${s.short.length}) | ${s.long.length ? pct(rate(s.long)) : '—'} (n=${s.long.length}) |`,
    )
    .join('\n');

  // Comparación a igualdad de longitud: solo resúmenes que SÍ entraron en 45.
  const matched = strat
    .filter((s) => s.short.length > 0)
    .map((s) => ({ model: s.model, n: s.short.length, r: rate(s.short) }))
    .sort((a, b) => b.r - a.r);

  // ---- 2. Intervención: cada variante contra su línea base
  const armRows: string[] = [];
  const deltas: { model: string; variant: string; dAttr: number; dAttrCi: number; dWords: number; dComp: number }[] = [];
  for (const m of models) {
    const base = find(m, PROD);
    for (const v of variants) {
      const a = find(m, v);
      if (!a) continue;
      const c = byCase(a.attributed);
      const paired = base && v !== PROD ? pairedDelta(a.attributed, base.attributed) : null;
      const d =
        base && paired
          ? {
              dAttr: paired.mean,
              dAttrCi: paired.halfWidth,
              dWords: avgWords(a.all) - avgWords(base.all),
              dComp: compliance(a.all) - compliance(base.all),
            }
          : null;
      if (d) deltas.push({ model: m, variant: v, ...d });
      armRows.push(
        `| \`${m}\` | \`${v}\` | ${pct(c.mean)} ± ${(c.halfWidth * 100).toFixed(1)} | ${pct(compliance(a.all))} | ${avgWords(a.all).toFixed(1)} | ${d ? `${signed(d.dAttr)} ± ${(d.dAttrCi * 100).toFixed(1)}` : '—'} | ${d ? (d.dWords >= 0 ? '+' : '') + d.dWords.toFixed(1) : '—'} |`,
      );
    }
  }

  // ---- 3. Lectura mecánica: frases derivadas de los números, no escritas a mano
  const lines: string[] = [];
  for (const m of models) {
    for (const v of ['hard-length', 'hard-length-priority']) {
      const d = deltas.find((x) => x.model === m && x.variant === v);
      if (!d) continue;
      const label = v === 'hard-length' ? 'límite duro' : 'límite duro + prioridad';
      // Comprobación de manipulación: el brazo solo prueba algo si de verdad
      // movió la longitud hacia abajo. Si el modelo ignoró la instrucción, el
      // resultado de atribución no es interpretable, y hay que decirlo aquí.
      const failed = d.dWords >= 0;
      // Si el intervalo del delta pareado cruza el cero, la diferencia cabe
      // dentro del ruido y no se puede afirmar nada con 40 casos.
      const crossesZero = Math.abs(d.dAttr) <= d.dAttrCi;
      lines.push(
        `- \`${m}\`, **${label}**: ${d.dWords >= 0 ? '+' : ''}${d.dWords.toFixed(1)} palabras de media, dentro del límite ${signed(d.dComp)}, atribución ${signed(d.dAttr)} ± ${(d.dAttrCi * 100).toFixed(1)} (pareado)` +
          (crossesZero ? ', **cabe dentro del ruido**' : ', **fuera del ruido**') +
          '.' +
          (failed
            ? ' Y la manipulación falló: el modelo no acortó, así que su atribución en este brazo no dice nada sobre el efecto de condensar.'
            : ''),
      );
    }
  }

  const md = `# Experimento: longitud contra atribución

> Generado por \`pnpm eval:experiment\` desde \`evals/runs/\`. No editar a mano.

**La pregunta.** [\`MODELS.md\`](MODELS.md) dejó esto sin resolver: \`qwen2.5-coder:7b\`
conserva la atribución mucho mejor que \`gemma4:latest\`, pero también escribe más
largo, y condensar es justo lo que tira el matiz del original. ¿Es un modelo
mejor, o solo un modelo más verboso?

**Unidad de análisis.** Las 3 repeticiones del mismo artículo están
correlacionadas, así que tratarlas como 60 observaciones independientes finge
precisión. Aquí la tasa se promedia por caso y el intervalo (±, normal al 95%) se
calcula sobre los 20 casos \`attributed\`. Con n=20 el intervalo es orientativo:
sirve para ver si una diferencia cabe dentro del ruido, no para un contraste
formal.

La columna **Δ atribución** es **pareada**: todos los brazos corrieron los mismos
casos, así que la diferencia se calcula caso contra caso. Eso quita de encima la
variabilidad entre artículos, que es enorme —unos llevan la duda en un verbo de
reporte y otros en un adjetivo suelto— y es la razón de que el ± del delta sea
mucho más estrecho que el ± de cada brazo por separado.

## 1. Observacional: atribución según la longitud que salió

De los casos no confirmados, tasa de atribución separando los resúmenes que
entraron en las ${WORD_LIMIT} palabras de los que se pasaron. Mismo modelo y mismo prompt:
lo único que cambia es la longitud que eligió el modelo.

| Modelo | Resúmenes ≤${WORD_LIMIT} palabras | Resúmenes >${WORD_LIMIT} palabras |
|---|---|---|
${stratRows}

${
  matched.length > 1
    ? `A igualdad de longitud —solo los resúmenes que entraron en el límite— el orden queda: ${matched
        .map((x) => `\`${x.model}\` ${pct(x.r)} (n=${x.n})`)
        .join(' · ')}.`
    : 'No hay suficientes resúmenes cortos en más de un modelo para comparar a igualdad de longitud.'
}

**Esto no prueba causalidad.** El modelo eligió cuánto escribir, así que un
artículo que salió corto puede ser también un artículo donde la duda era fácil de
omitir. Para eso está la parte 2.

## 2. Intervención: forzar la longitud por prompt

Tres brazos, mismo dataset y mismas repeticiones (ver \`apps/api/src/evals/variants.ts\`):

| Variante | Qué prueba |
|---|---|
| \`prod\` | El prompt real, con el límite blando ("máx. 45 palabras; no te pases"). |
| \`hard-length\` | Mismo límite, exigido ("el límite es estricto… reescríbelo más corto"). No dice qué sacrificar. |
| \`hard-length-priority\` | Lo anterior más la regla de qué recortar primero: detalle secundario sí, atribución no. |

| Modelo | Variante | Atribución (por caso) | ≤${WORD_LIMIT} palabras | Palabras | Δ atribución (pareado) | Δ palabras |
|---|---|---|---|---|---|---|
${armRows.join('\n')}

## 3. Lectura mecánica

${lines.length ? lines.join('\n') : 'Faltan brazos: corre las variantes con `EVAL_PROMPT`.'}

Cómo leerlo: si forzar la longitud **sin** decir qué sacrificar baja la
atribución, entonces la ventaja del modelo verboso era en parte la verbosidad. Si
la atribución aguanta, el modelo era mejor de verdad. Y si el brazo con regla de
prioridad recupera la atribución **manteniendo** la longitud, entonces esto no se
arregla cambiando de modelo sino escribiendo mejor el prompt, que es más barato y
no toca la infraestructura.

## Corridas usadas

| Modelo | Variante | Corrida | Fecha |
|---|---|---|---|
${arms
  .slice()
  .sort((a, b) => a.model.localeCompare(b.model) || a.variant.localeCompare(b.variant))
  .map((a) => `| \`${a.model}\` | \`${a.variant}\` | \`${a.file}\` | ${a.at.slice(0, 16).replace('T', ' ')} |`)
  .join('\n')}
`;

  writeFileSync(join(ROOT, 'evals', 'EXPERIMENT-length.md'), md);
  console.log('escrito: evals/EXPERIMENT-length.md');
  for (const s of strat) {
    const sh = s.short.length ? pct(rate(s.short)) : '—';
    const lo = s.long.length ? pct(rate(s.long)) : '—';
    console.log(`  ${s.model.padEnd(20)} cortos ${sh} (n=${s.short.length}) · largos ${lo} (n=${s.long.length})`);
  }
  for (const l of lines) console.log(`  ${l.replace(/[*`]/g, '')}`);
}

main();
