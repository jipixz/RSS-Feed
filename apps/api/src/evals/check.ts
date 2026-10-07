/**
 * Puerta de calidad para CI. Re-puntúa el último snapshot con el scorer actual
 * y falla si la calidad cae por debajo de los umbrales.
 *
 * No llama al modelo: por eso puede correr en GitHub Actions. Lo que valida es
 * que (a) el snapshot sigue cumpliendo y (b) nadie aflojó el scorer sin querer.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Label, aggregate, scoreOne } from './scorer';

/**
 * Puertas de NO REGRESIÓN, no objetivos de calidad.
 *
 * Están calibradas por debajo de la línea base medida (atribución 73%,
 * matices 0%, longitud 90% — ver evals/REPORT.md) con margen para el ruido de
 * `temperature 0.3`. Sirven para detectar que algo empeoró, no para afirmar
 * que la calidad es buena: el 73% de atribución es justamente lo que falta
 * por subir. Cuando mejore, estos números suben con él.
 */
const THRESHOLDS = {
  attributionRate: 0.65, // de los casos no confirmados, cuántos conservan la atribución
  falseHedgeRate: 0.1, // máximo de hechos confirmados a los que se les meten matices
  lengthCompliance: 0.8, // mínimo dentro de las 45 palabras
};

interface Snapshot {
  at: string;
  model: string;
  repeats: number;
  prompt: string;
  runs: { label: Label; split: string; summaries: string[] }[];
}

function main() {
  const file = join(process.cwd(), 'evals', 'runs', 'latest.json');
  if (!existsSync(file)) {
    console.error('No hay evals/runs/latest.json. Genera uno con `pnpm eval:run`.');
    process.exit(1);
  }
  const snap: Snapshot = JSON.parse(readFileSync(file, 'utf8'));

  const flat = snap.runs.flatMap((r) => r.summaries.map((s) => ({ label: r.label, split: r.split, score: scoreOne(s, r.label) })));
  const overall = aggregate(flat);
  const holdout = aggregate(flat.filter((f) => f.split === 'holdout'));

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`snapshot: ${snap.at} · modelo ${snap.model} · ${snap.repeats} repeticiones · ${flat.length} observaciones`);
  console.log(`  atribución conservada : ${pct(overall.attributionRate)} (holdout ${pct(holdout.attributionRate)})  [mín ${pct(THRESHOLDS.attributionRate)}]`);
  console.log(`  matices indebidos     : ${pct(overall.falseHedgeRate)} (holdout ${pct(holdout.falseHedgeRate)})  [máx ${pct(THRESHOLDS.falseHedgeRate)}]`);
  console.log(`  dentro de 45 palabras : ${pct(overall.lengthCompliance)}  [mín ${pct(THRESHOLDS.lengthCompliance)}]`);
  console.log(`  palabras de media     : ${overall.avgWords.toFixed(1)}`);

  const failures: string[] = [];
  if (overall.attributionRate < THRESHOLDS.attributionRate) failures.push(`atribución ${pct(overall.attributionRate)} < ${pct(THRESHOLDS.attributionRate)}`);
  if (overall.falseHedgeRate > THRESHOLDS.falseHedgeRate) failures.push(`matices indebidos ${pct(overall.falseHedgeRate)} > ${pct(THRESHOLDS.falseHedgeRate)}`);
  if (overall.lengthCompliance < THRESHOLDS.lengthCompliance) failures.push(`longitud ${pct(overall.lengthCompliance)} < ${pct(THRESHOLDS.lengthCompliance)}`);

  if (failures.length) {
    console.error(`\nFALLA la puerta de calidad:\n  - ${failures.join('\n  - ')}`);
    process.exit(1);
  }
  console.log('\nOK: el último snapshot cumple los umbrales.');
}

main();
