/**
 * Afinidad determinista por palabras clave (0–100): qué tanto una muestra de
 * textos coincide con los intereses del usuario. Transparente y sin IA — es la
 * misma base que rankea la vista "Hoy" y el análisis de Descubrir.
 */
export function scoreAffinity(
  samples: { title: string; extra?: string }[],
  terms: string[],
): { score: number; matched: string[] } {
  const clean = terms.map((t) => t.toLowerCase().trim()).filter(Boolean);
  let matchedSamples = 0;
  let totalHits = 0;
  const matched = new Set<string>();
  for (const s of samples) {
    const hay = `${s.title} ${s.extra ?? ''}`.toLowerCase();
    let hit = false;
    for (const term of clean) {
      if (hay.includes(term)) { totalHits += 1; matched.add(term); hit = true; }
    }
    if (hit) matchedSamples += 1;
  }
  const n = samples.length || 1;
  const coverage = matchedSamples / n; // % de artículos que tocan algún interés
  const density = Math.min(1, totalHits / (n * 2)); // qué tan denso el match
  return { score: Math.round((coverage * 0.7 + density * 0.3) * 100), matched: [...matched] };
}
