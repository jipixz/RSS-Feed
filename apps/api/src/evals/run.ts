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

const MODEL = process.env.EVAL_MODEL ?? 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const REPEATS = Number(process.env.EVAL_REPEATS ?? 3);
const ROOT = join(process.cwd(), '..', '..');

async function summarize(title: string, text: string): Promise<string> {
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
  return (data.message?.content ?? '').trim();
}

async function main() {
  const cases: Case[] = readFileSync(join(ROOT, 'evals', 'dataset', 'cases.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Case);

  console.log(`modelo: ${MODEL} · casos: ${cases.length} · repeticiones: ${REPEATS}`);
  const started = Date.now();
  const runs: { id: string; label: Label; split: string; title: string; summaries: string[] }[] = [];

  for (const [i, c] of cases.entries()) {
    const summaries: string[] = [];
    for (let r = 0; r < REPEATS; r++) summaries.push(await summarize(c.title, c.excerpt));
    runs.push({ id: c.id, label: c.label, split: c.split, title: c.title, summaries });
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

  const snapshot = {
    at: new Date().toISOString(),
    model: MODEL,
    repeats: REPEATS,
    prompt: SUMMARY_SYSTEM_PROMPT,
    durationMs: Date.now() - started,
    overall,
    bySplit,
    runs,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${stamp}-${MODEL.replace(/[^a-z0-9.]+/gi, '-')}.json`;
  writeFileSync(join(ROOT, 'evals', 'runs', name), JSON.stringify(snapshot, null, 2));
  writeFileSync(join(ROOT, 'evals', 'runs', 'latest.json'), JSON.stringify(snapshot, null, 2));

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`\nholdout  · atribución ${pct(bySplit.holdout.attributionRate)} · hedge indebido ${pct(bySplit.holdout.falseHedgeRate)}`);
  console.log(`global   · atribución ${pct(overall.attributionRate)} · hedge indebido ${pct(overall.falseHedgeRate)} · ≤45 palabras ${pct(overall.lengthCompliance)} · media ${overall.avgWords.toFixed(1)}`);
  console.log(`\nguardado: evals/runs/${name}`);
}

void main();
