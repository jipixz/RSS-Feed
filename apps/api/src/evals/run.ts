/**
 * Ejecuta la evaluación contra el modelo local (Ollama) y guarda un snapshot.
 *
 * NO corre en CI: necesita Ollama. Se ejecuta a mano con `pnpm eval:run` y el
 * resultado se versiona en evals/runs/, que es lo que el CI verifica después.
 *
 * Usa el prompt REAL del código, no una copia, para que la medición
 * corresponda a lo que hay en producción.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SUMMARY_SYSTEM_PROMPT } from '../ai/provider/prompt';
import { Label, aggregate, scoreOne } from './scorer';

interface Case {
  id: string;
  label: Label;
  why: string;
  title: string;
  source: string;
  url: string;
  excerpt: string;
  split: 'iteration' | 'holdout';
}

/**
 * Modelo de produccion. Solo su corrida actualiza `latest.json`, que es el
 * snapshot que verifica el CI: medir un modelo alternativo no debe cambiar
 * la puerta de calidad de lo que corre en la Pi.
 */
const PROD_MODEL = 'gemma4:latest';
const MODEL = process.env.EVAL_MODEL ?? PROD_MODEL;
const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const REPEATS = Number(process.env.EVAL_REPEATS ?? 3);
const ROOT = join(process.cwd(), '..', '..');

async function summarize(title: string, text: string): Promise<{ text: string; ms: number }> {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    signal: AbortSignal.timeout(300_000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      keep_alive: '30m',
      think: false,
      options: { temperature: 0.3, num_predict: 200 },
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `Título: ${title}\n\nArtículo:\n${text}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return { text: (data.message?.content ?? '').trim(), ms: Date.now() - started };
}

async function main() {
  const cases: Case[] = readFileSync(join(ROOT, 'evals', 'dataset', 'cases.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Case);

  console.log(`modelo: ${MODEL} · casos: ${cases.length} · repeticiones: ${REPEATS}`);
  const started = Date.now();
  const runs: { id: string; label: Label; split: string; title: string; summaries: string[]; ms: number[] }[] = [];

  for (const [i, c] of cases.entries()) {
    const summaries: string[] = [];
    const ms: number[] = [];
    for (let r = 0; r < REPEATS; r++) {
      const out = await summarize(c.title, c.excerpt);
      summaries.push(out.text);
      ms.push(out.ms);
    }
    runs.push({ id: c.id, label: c.label, split: c.split, title: c.title, summaries, ms });
    const ok = summaries.filter((s) => scoreOne(s, c.label).pass).length;
    console.log(`  [${i + 1}/${cases.length}] ${c.label.padEnd(10)} ${ok}/${REPEATS} ok · ${c.title.slice(0, 48)}`);
  }

  // Una repetición = una observación independiente; así la tasa refleja el ruido
  // de temperature 0.3 en vez de esconderlo.
  const flat = runs.flatMap((r) => r.summaries.map((s) => ({ label: r.label, split: r.split, score: scoreOne(s, r.label) })));
  const overall = aggregate(flat);
  const bySplit = {
    iteration: aggregate(flat.filter((f) => f.split === 'iteration')),
    holdout: aggregate(flat.filter((f) => f.split === 'holdout')),
  };

  const allMs = runs.flatMap((r) => r.ms).sort((a, b) => a - b);
  const latency = {
    meanMs: Math.round(allMs.reduce((a, b) => a + b, 0) / allMs.length),
    medianMs: allMs[Math.floor(allMs.length / 2)],
    p90Ms: allMs[Math.floor(allMs.length * 0.9)],
    minMs: allMs[0],
    maxMs: allMs[allMs.length - 1],
  };

  const snapshot = {
    at: new Date().toISOString(),
    model: MODEL,
    repeats: REPEATS,
    prompt: SUMMARY_SYSTEM_PROMPT,
    durationMs: Date.now() - started,
    latency,
    overall,
    bySplit,
    runs,
  };

  // fecha y hora: dos corridas del mismo modelo el mismo dia no se pisan
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const name = `${stamp}-${MODEL.replace(/[^a-z0-9.]+/gi, '-')}.json`;
  writeFileSync(join(ROOT, 'evals', 'runs', name), JSON.stringify(snapshot, null, 2));
  if (MODEL === PROD_MODEL) {
    writeFileSync(join(ROOT, 'evals', 'runs', 'latest.json'), JSON.stringify(snapshot, null, 2));
  } else {
    console.log(`
(${MODEL} no es el modelo de produccion: no se toca latest.json)`);
  }

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`\nholdout  · atribución ${pct(bySplit.holdout.attributionRate)} · hedge indebido ${pct(bySplit.holdout.falseHedgeRate)}`);
  console.log(`latencia · media ${(latency.meanMs / 1000).toFixed(2)}s · mediana ${(latency.medianMs / 1000).toFixed(2)}s · p90 ${(latency.p90Ms / 1000).toFixed(2)}s`);
  console.log(`global   · atribución ${pct(overall.attributionRate)} · hedge indebido ${pct(overall.falseHedgeRate)} · ≤45 palabras ${pct(overall.lengthCompliance)} · media ${overall.avgWords.toFixed(1)}`);
  console.log(`\nguardado: evals/runs/${name}`);
}

void main();
