/**
 * Extrae candidatos de la BD para el dataset de evaluación.
 * No corre en CI: es una herramienta de autor. El etiquetado final es humano.
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Señales de INCERTIDUMBRE genuina (el hecho no está confirmado).
const UNCERTAIN = /\b(is investigating|investigation into|investigating (whether|if)|allegedly|reportedly|suspected|believed to|likely responsible|may have|appears to have|accused of|accuses|claims that|unconfirmed|denied|denies|according to a (new )?report)\b/i;
// "according to <fuente oficial>" NO implica incertidumbre: es atribución de un hecho.
const OFFICIAL = /\baccording to (CISA|the FBI|Microsoft|Google|Apple|the company|researchers at)\b/i;

const strip = (h: string) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const EXCERPT = 1200;

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.article.findMany({
    where: { contentStatus: 'full', fullContent: { not: '' } },
    orderBy: { publishedAt: 'desc' },
    take: 1500,
    select: { id: true, title: true, link: true, fullContent: true, feed: { select: { title: true } } },
  });
  await prisma.$disconnect();

  const usable = rows
    .map((r) => ({ ...r, text: strip(r.fullContent) }))
    .filter((r) => r.text.length > 1200);

  const seen = new Set<string>();
  const dedup = usable.filter((r) => {
    const k = r.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const head = (r: { text: string }) => r.text.slice(0, 1500);
  const likelyUncertain = dedup.filter((r) => UNCERTAIN.test(head(r)));
  const likelyFactual = dedup.filter((r) => !UNCERTAIN.test(head(r)) && !OFFICIAL.test(head(r)));

  const pick = <T,>(arr: T[], n: number) => arr.slice(0, n);
  const candidates = [
    ...pick(likelyUncertain, 26).map((r) => ({ hint: 'attributed', ...r })),
    ...pick(likelyFactual, 26).map((r) => ({ hint: 'factual', ...r })),
  ].map((r) => ({
    id: r.id,
    hint: r.hint,
    title: r.title,
    url: r.link,
    source: r.feed.title,
    excerpt: r.text.slice(0, EXCERPT),
  }));

  const out = join(process.cwd(), '..', '..', 'evals', 'dataset', 'candidates.jsonl');
  writeFileSync(out, candidates.map((c) => JSON.stringify(c)).join('\n'));
  console.log(`candidatos: ${candidates.length} -> ${out}\n`);
  candidates.forEach((c, i) => {
    console.log(`#${i} [${c.hint}] ${c.title.slice(0, 72)}`);
    console.log(`    ${c.excerpt.slice(0, 190).replace(/\s+/g, ' ')}…\n`);
  });
}

void main();
