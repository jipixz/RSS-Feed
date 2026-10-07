/**
 * Genera evals/REPORT.md a partir del último snapshot, para que el resultado
 * sea legible en el repo sin abrir un JSON de 100 KB.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Label, aggregate, scoreOne } from './scorer';

const ROOT = join(process.cwd(), '..', '..');

interface Snapshot {
  at: string;
  model: string;
  repeats: number;
  prompt: string;
  durationMs: number;
  runs: { id: string; label: Label; split: string; title: string; summaries: string[] }[];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function main() {
  const snap: Snapshot = JSON.parse(readFileSync(join(ROOT, 'evals', 'runs', 'latest.json'), 'utf8'));
  const flat = snap.runs.flatMap((r) => r.summaries.map((s) => ({ label: r.label, split: r.split, score: scoreOne(s, r.label) })));
  const overall = aggregate(flat);
  const holdout = aggregate(flat.filter((f) => f.split === 'holdout'));
  const iteration = aggregate(flat.filter((f) => f.split === 'iteration'));

  // Casos que siguen fallando, para que el reporte sea útil y no decorativo
  const failing = snap.runs
    .filter((r) => r.label === 'attributed')
    .map((r) => ({
      title: r.title,
      split: r.split,
      fails: r.summaries.filter((s) => !scoreOne(s, r.label).pass).length,
      example: r.summaries.find((s) => !scoreOne(s, r.label).pass) ?? '',
    }))
    .filter((c) => c.fails > 0)
    .sort((a, b) => b.fails - a.fails);

  const md = `# Resultado de la evaluación

> Generado por \`pnpm eval:report\` desde \`evals/runs/latest.json\`. No editar a mano.

- **Fecha:** ${snap.at}
- **Modelo:** \`${snap.model}\`
- **Casos:** ${snap.runs.length} · **Repeticiones:** ${snap.repeats} · **Observaciones:** ${flat.length}
- **Duración:** ${(snap.durationMs / 60000).toFixed(1)} min

## Métricas

| Métrica | Global | Holdout | Iteration |
|---|---|---|---|
| Atribución conservada | **${pct(overall.attributionRate)}** | ${pct(holdout.attributionRate)} | ${pct(iteration.attributionRate)} |
| Matices indebidos | ${pct(overall.falseHedgeRate)} | ${pct(holdout.falseHedgeRate)} | ${pct(iteration.falseHedgeRate)} |
| Dentro de 45 palabras | ${pct(overall.lengthCompliance)} | ${pct(holdout.lengthCompliance)} | ${pct(iteration.lengthCompliance)} |
| Preámbulo indebido | ${pct(overall.preambleRate)} | — | — |
| Palabras de media | ${overall.avgWords.toFixed(1)} | ${holdout.avgWords.toFixed(1)} | ${iteration.avgWords.toFixed(1)} |

**Cómo leerlo.** *Atribución conservada* es la métrica principal: de los artículos
cuyo hecho central NO está confirmado, qué proporción de resúmenes mantiene la
marca de duda en vez de afirmarlo. *Matices indebidos* es el contrapeso: de los
hechos SÍ confirmados, cuántos recibieron matices que el original no tiene.

El \`holdout\` no se miró al ajustar el prompt. Con solo ${holdout.n} observaciones,
una sola diferencia mueve el porcentaje varios puntos: trátalo como señal, no
como medida fina.

## Qué falla todavía

${failing.length === 0
  ? 'Ningún caso falla en esta corrida.'
  : failing
      .map((c) => `**${c.title.slice(0, 70)}** · ${c.fails}/${snap.repeats} fallos · \`${c.split}\`\n\n> ${c.example.slice(0, 180).replace(/\s+/g, ' ')}\n`)
      .join('\n')}

El patrón dominante: la incertidumbre del original vive en un modificador
("*alleged* leaders", "*linked to*", "*appears to* have solved") y no en un verbo
de reporte, así que el modelo la deja caer al condensar.

## Prompt evaluado

\`\`\`
${snap.prompt}
\`\`\`
`;

  writeFileSync(join(ROOT, 'evals', 'REPORT.md'), md);
  console.log('escrito: evals/REPORT.md');
  console.log(`  atribución ${pct(overall.attributionRate)} · holdout ${pct(holdout.attributionRate)} · casos con fallo: ${failing.length}`);
}

main();
