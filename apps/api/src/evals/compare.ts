/**
 * Compara los snapshots de evals/runs/ y escribe evals/MODELS.md.
 *
 * Existe porque el benchmark de modelos original era prosa en el README: tres
 * artículos medidos a mano, sin datos revisables. Y al medirlo en serio salió
 * al revés de lo que decía. Aquí los mismos 40 casos del eval corren con cada
 * modelo, así la velocidad y la calidad salen de la misma corrida y quedan
 * versionadas.
 *
 * No llama a ningún modelo: solo re-puntúa lo que ya está guardado.
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Label, aggregate, scoreOne } from './scorer';

const ROOT = join(process.cwd(), '..', '..');
const RUNS = join(ROOT, 'evals', 'runs');

interface Snapshot {
  at: string;
  model: string;
  /** Ausente en snapshots anteriores al experimento de variantes = 'prod'. */
  promptVariant?: string;
  repeats: number;
  durationMs: number;
  latency?: { meanMs: number; medianMs: number; p90Ms: number; minMs: number; maxMs: number };
  runs: { label: Label; split: string; summaries: string[]; ms?: number[] }[];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

function main() {
  // latest.json es copia del snapshot de producción; incluirlo duplicaría fila.
  const files = readdirSync(RUNS).filter((f) => f.endsWith('.json') && f !== 'latest.json');
  if (!files.length) {
    console.error(`No hay snapshots en ${RUNS}. Genera uno con "pnpm eval:run".`);
    process.exit(1);
  }

  const all = files
    .map((f) => ({ f, snap: JSON.parse(readFileSync(join(RUNS, f), 'utf8')) as Snapshot }))
    // La comparativa de modelos compara modelos, no prompts: las variantes del
    // experimento se analizan en experiment.ts, no aqui.
    .filter(({ snap }) => (snap.promptVariant ?? 'prod') === 'prod')
    .map(({ f, snap }) => {
      const flat = snap.runs.flatMap((r) => r.summaries.map((s) => ({ label: r.label, split: r.split, score: scoreOne(s, r.label) })));
      const agg = aggregate(flat);
      // Los snapshots anteriores a instrumentar run.ts no traen `latency`: la
      // media sale de la duración total entre el número de llamadas, que son
      // secuenciales.
      const meanMs = snap.latency?.meanMs ?? Math.round(snap.durationMs / flat.length);
      return { file: f, snap, agg, meanMs, holdout: aggregate(flat.filter((x) => x.split === 'holdout')) };
    })
    .sort((a, b) => b.snap.at.localeCompare(a.snap.at));

  // Una fila por modelo, la corrida más reciente. Las demás se listan abajo:
  // dos corridas del mismo modelo miden cuánto se mueve el número solo.
  const newest = new Map<string, (typeof all)[number]>();
  for (const r of all) if (!newest.has(r.snap.model)) newest.set(r.snap.model, r);
  const rows = [...newest.values()].sort((a, b) => b.agg.attributionRate - a.agg.attributionRate);

  const cases = rows[0].agg.n / rows[0].snap.repeats;
  // Palabras por segundo: la latencia por resumen premia al modelo que escribe
  // corto, que es un efecto del prompt, no de la maquina. Normalizar por lo
  // producido separa las dos cosas.
  const fmt = (r: (typeof rows)[number]) =>
    `| \`${r.snap.model}\` | ${secs(r.meanMs)} | ${r.snap.latency ? secs(r.snap.latency.p90Ms) : '—'} | ${(r.agg.avgWords / (r.meanMs / 1000)).toFixed(1)} | ${pct(r.agg.attributionRate)} | ${pct(r.agg.falseHedgeRate)} | ${pct(r.agg.lengthCompliance)} | ${r.agg.avgWords.toFixed(1)} |`;

  const hist = (r: (typeof all)[number]) =>
    `| \`${r.file}\` | \`${r.snap.model}\` | ${r.snap.at.slice(0, 16).replace('T', ' ')} | ${pct(r.agg.attributionRate)} | ${pct(r.agg.lengthCompliance)} | ${secs(r.meanMs)} |`;

  const md = `# Comparativa de modelos

> Generado por \`pnpm eval:compare\` desde \`evals/runs/\`. No editar a mano.

Mismos ${cases} casos y mismo prompt para todos, cada caso ${rows[0].snap.repeats} veces. La velocidad y la
calidad salen de la misma corrida, no de pruebas distintas.

| Modelo | Media | p90 | Palabras/s | Atribución | Matices indebidos | ≤45 palabras | Palabras |
|---|---|---|---|---|---|---|---|
${rows.map(fmt).join('\n')}

**Latencia** por resumen, en la máquina con la GPU de 8 GB, en llamadas
secuenciales a Ollama con el modelo ya cargado (\`keep_alive: 30m\`). El p90 solo
existe en snapshots posteriores a instrumentar \`run.ts\`.

**Atribución** es la métrica principal: de los artículos cuyo hecho central NO
está confirmado, cuántos resúmenes conservan la marca de duda. Qué mide y qué no,
en [\`README.md\`](README.md).

## Reparto CPU/GPU

Medido con \`ollama ps\` cargando cada modelo solo, con el mismo contexto de 4096:

| Modelo | Cargado | CPU/GPU |
|---|---|---|
| \`qwen2.5-coder:7b\` | 5.4 GB | 8% / 92% |
| \`deepseek-r1:8b\` | 6.0 GB | 15% / 85% |
| \`gemma4:latest\` | 10 GB | 66% / 34% |

## Lectura

**La velocidad por resumen no distingue a los modelos, y encima engaña.** Los tres
caen entre 3.1 y 3.6 s, y dos corridas del mismo \`gemma4\` se separaron más entre
sí (2.70 s contra 3.10 s) que los modelos entre ellos. El benchmark de 3 artículos
que decía que los 7B eran el doble de rápidos era ruido.

Pero la latencia por resumen premia al que escribe corto, y eso es el prompt, no
la máquina. Normalizada, la columna **Palabras/s** ordena al revés: los modelos que
viven en la GPU generan algo más rápido, consistente con su reparto (92% y 85% en
GPU contra el 34% de \`gemma4\`). O sea que \`gemma4\` corre dos tercios en CPU y
aun así gana en tiempo por resumen, porque produce ~12 palabras menos. La ventaja
real de meter el modelo entero en VRAM existe, pero es del orden del 10%, no del
100%, y se la come la longitud de salida.

**Lo que sí separa a los modelos son dos columnas que tiran en direcciones
opuestas.** \`qwen2.5-coder:7b\` conserva la atribución casi siempre pero se pasa
del límite de 45 palabras en 6 de cada 10 resúmenes; \`gemma4:latest\` respeta la
longitud 9 de cada 10 veces y pierde la atribución en 1 de cada 4.

Y están ligadas, conviene decirlo en voz alta: condensar es justo lo que tira el
matiz del original. Un resumen de 51 palabras tiene sitio para el "según un
reporte" que uno de 40 recorta. Así que el eval no mide dos virtudes
independientes, y comparar atribución entre modelos con longitudes distintas
favorece al más verboso.

Eso dejó una pregunta: si se le aprieta la longitud a \`qwen2.5-coder:7b\`,
¿mantiene el 96.7% o cae al nivel de \`gemma4\`? Se midió, y está en
[\`EXPERIMENT-length.md\`](EXPERIMENT-length.md). Resumen: condensar **sí** cuesta
atribución (forzar \`gemma4\` a 35 palabras le quitó 10 puntos), pero eso no explica
la diferencia entre modelos —a igualdad de longitud qwen sigue 15 puntos arriba— y
el brazo que iba a zanjarlo no se pudo correr, porque al exigirle el límite
\`qwen2.5-coder:7b\` escribió **más** largo. Un modelo al que no se le puede imponer
una longitud no sirve para este caso de uso, con o sin la pregunta original.

## Todas las corridas

Repetir la corrida es la única forma de separar la señal del ruido de
\`temperature 0.3\`. Las dos de \`gemma4:latest\` dieron calidad idéntica y latencias
distintas (2.70 s contra 3.10 s), así que las diferencias de latencia por debajo
de medio segundo entre modelos no significan nada.

| Corrida | Modelo | Fecha | Atribución | ≤45 palabras | Media |
|---|---|---|---|---|---|
${all.map(hist).join('\n')}
`;

  writeFileSync(join(ROOT, 'evals', 'MODELS.md'), md);
  console.log('escrito: evals/MODELS.md');
  for (const r of rows) {
    console.log(`  ${r.snap.model.padEnd(22)} ${secs(r.meanMs).padStart(8)} · atribución ${pct(r.agg.attributionRate)} · ≤45 palabras ${pct(r.agg.lengthCompliance)}`);
  }
}

main();
