/**
 * Construye el dataset de evaluación a partir de artículos reales de la BD.
 * Las etiquetas son MANUALES (revisadas una por una); aquí solo se materializan.
 * Herramienta de autor: no corre en CI.
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';

type Label = 'attributed' | 'factual';
interface Spec {
  match: string;
  label: Label;
  why: string;
}

// attributed = el hecho central NO está confirmado (investigación en curso,
//              sospecha, acusación sin resolver, atribución tentativa,
//              "may have" / "likely" / "appears to").
// factual    = hecho confirmado (anuncio oficial, parche publicado, contenido
//              técnico), aunque venga atribuido a una fuente.
const SPECS: Spec[] = [
  // ── attributed (20) ────────────────────────────────────────────────────────
  { match: 'OpenAI Investigates Report Linking AI Agents', label: 'attributed', why: 'Investigación en curso; el reporte dice "likely responsible", no confirmado.' },
  { match: 'Suspected sabotage causes major Netherlands', label: 'attributed', why: 'El sabotaje es sospecha, no está determinado.' },
  { match: 'Suspected Black Axe gang leaders face cybercrime', label: 'attributed', why: 'Alleged leaders enfrentando cargos: acusación sin condena.' },
  { match: 'Digital Agency says VPN flaw exposed', label: 'attributed', why: 'El alcance es estimado: "may have exposed".' },
  { match: 'Cyphral Distich', label: 'attributed', why: 'Dice "it appears to have solved it": resultado no verificado.' },
  { match: 'Hackers exploit Tencent app flaw to deploy GrayRabbit', label: 'attributed', why: 'Atribución tentativa: actores "linked to" un grupo chino.' },
  { match: 'US Customs supervisor busted for stealing hardware', label: 'attributed', why: 'Todo el relato va atribuido a un reporte de The Maine Wire.' },
  { match: 'inside the Sun could reveal', label: 'attributed', why: 'Hipótesis científica: "may have engulfed", "suggesting".' },
  { match: 'OpenAI Agents Linked to RubyGems Campaign', label: 'attributed', why: 'La autoría se afirma "according to a new report".' },
  { match: 'PaperCut Attacker Uses Hundreds of AI Agents', label: 'attributed', why: 'Actor "suspected" y autoría "attributed to".' },
  { match: 'Slim Spider Steals Crypto Custody Secrets', label: 'attributed', why: 'El actor "has been linked to" los ataques: atribución tentativa.' },
  { match: 'TeamPCP', label: 'attributed', why: 'Detenidos "believed to be members"; pertenencia no probada.' },
  { match: 'Shell investigates', label: 'attributed', why: 'Incidente "potencial" bajo investigación tras un claim del grupo.' },
  { match: 'Trivy, Not LiteLLM Behind', label: 'attributed', why: 'Afectación "believed to have been" y causa en disputa.' },
  { match: 'Likely Impacted by RingCentral Data Breach', label: 'attributed', why: '"Likely impacted" y datos que "appear to have been stolen".' },
  { match: 'New Bedford police officer accused of using Flock', label: 'attributed', why: 'Acusación de una ex pareja, sin resolución.' },
  { match: 'Delta probes Wi-Fi deauth attack', label: 'attributed', why: 'La aerolínea está investigando; no hay conclusión.' },
  { match: 'Wesco confirms security incident after ExfilSquad', label: 'attributed', why: 'Investiga el robo que el grupo "claims"; alcance sin confirmar.' },
  { match: 'Ethicist Reportedly Left', label: 'attributed', why: 'La salida se reporta ("reportedly"), sin confirmación oficial.' },
  { match: 'China-Linked Hackers Deploy New StormEncryptor', label: 'attributed', why: 'Atribución "China-linked" y motivación "likely".' },

  // ── factual (20) ───────────────────────────────────────────────────────────
  { match: 'NOLOCK', label: 'factual', why: 'Explicación técnica con demostración: comportamiento verificable.' },
  { match: 'Java 27 Released', label: 'factual', why: 'Release oficial anunciado como disponible.' },
  { match: 'e-ink frame that hears birds', label: 'factual', why: 'Proyecto existente descrito por su autor.' },
  { match: 'Postgres development activity', label: 'factual', why: 'Análisis de datos del repositorio: hechos medibles.' },
  { match: 'Search over Algebraic Graphs', label: 'factual', why: 'Contenido técnico/matemático, sin incertidumbre factual.' },
  { match: 'Performance Improvements in .NET 11', label: 'factual', why: 'Mejoras medidas y publicadas por el equipo.' },
  { match: 'Human Attacker Exploits Marimo RCE', label: 'factual', why: 'Incidente documentado con cadena de ataque confirmada.' },
  { match: 'Hit by Data Breach at Japan', label: 'factual', why: 'La agencia "has disclosed" la brecha: confirmada.' },
  { match: 'Attack Chains, Not Just Attack Surfaces', label: 'factual', why: 'Artículo de metodología de seguridad, sin hechos en disputa.' },
  { match: 'IBM Built the Cold War', label: 'factual', why: 'Relato histórico documentado.' },
  { match: 'Apple Patches 200 Vulnerabilities', label: 'factual', why: 'Parches anunciados oficialmente por Apple.' },
  { match: 'How much of F-Droid is LLM generated', label: 'factual', why: 'Análisis con datos del propio repositorio.' },
  { match: 'Microsoft AI Code of Conduct', label: 'factual', why: 'Documento publicado por Microsoft: hecho verificable.' },
  { match: 'CSS-Tricks in Limbo', label: 'factual', why: 'Estado del sitio relatado por quien lo conoce de primera mano.' },
  { match: 'Hacked HBO Max Reddit Account', label: 'factual', why: 'Compromiso confirmado y campaña observada.' },
  { match: 'The terminal should not own the work', label: 'factual', why: 'Documento de diseño técnico, sin afirmaciones noticiosas.' },
  { match: 'Microsoft confirms KB5002914', label: 'factual', why: 'Microsoft "has confirmed" el fallo.' },
  { match: 'Alternatives to MinIO', label: 'factual', why: 'Comparativa técnica probada por el autor.' },
  { match: 'k-server conjecture is true', label: 'factual', why: 'Resultado matemático con demostración publicada.' },
  { match: 'Cisco patches Secure Email Gateway zero-day', label: 'factual', why: 'Parche publicado y explotación confirmada por Cisco.' },
];

const strip = (h: string) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const EXCERPT = 1200;

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.article.findMany({
    where: { contentStatus: 'full', fullContent: { not: '' } },
    orderBy: { publishedAt: 'desc' },
    take: 3000,
    select: { id: true, title: true, link: true, fullContent: true, feed: { select: { title: true } } },
  });
  await prisma.$disconnect();

  interface Case {
    id: string;
    label: Label;
    why: string;
    title: string;
    source: string;
    url: string;
    excerpt: string;
  }
  const cases: Case[] = [];
  const missing: string[] = [];
  const used = new Set<string>();
  for (const spec of SPECS) {
    const hit = rows.find((r) => r.title.includes(spec.match) && !used.has(r.id));
    if (!hit) {
      missing.push(spec.match);
      continue;
    }
    used.add(hit.id);
    cases.push({
      id: hit.id,
      label: spec.label,
      why: spec.why,
      title: hit.title,
      source: hit.feed.title,
      url: hit.link,
      excerpt: strip(hit.fullContent).slice(0, EXCERPT),
    });
  }

  // Split estratificado 60/40: el prompt se afina mirando `iteration`,
  // el número que se reporta sale de `holdout`.
  const withSplit = (['attributed', 'factual'] as Label[]).flatMap((label) => {
    const group = cases.filter((c) => c.label === label);
    const cut = Math.round(group.length * 0.6);
    return group.map((c, i) => ({ ...c, split: i < cut ? 'iteration' : 'holdout' }));
  });

  const out = join(process.cwd(), '..', '..', 'evals', 'dataset', 'cases.jsonl');
  writeFileSync(out, withSplit.map((c) => JSON.stringify(c)).join('\n') + '\n');

  const count = (l: string, s: string) => withSplit.filter((c) => c.label === l && c.split === s).length;
  console.log(`casos: ${withSplit.length}  ->  ${out}`);
  console.log(`  attributed: ${count('attributed', 'iteration')} iteration / ${count('attributed', 'holdout')} holdout`);
  console.log(`  factual   : ${count('factual', 'iteration')} iteration / ${count('factual', 'holdout')} holdout`);
  if (missing.length) console.log(`\nNO ENCONTRADOS (${missing.length}):\n  ${missing.join('\n  ')}`);
}

void main();
