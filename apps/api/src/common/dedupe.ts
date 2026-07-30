/**
 * Clave para detectar la misma noticia entre fuentes distintas (Lobsters/HN/
 * Hacker News suelen conservar el título idéntico). Título normalizado; si es
 * muy corto/ambiguo, cae al link normalizado (mismo artículo externo).
 */
export function dedupeKey(title: string, link: string): string {
  const t = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (t.length >= 12) return `t:${t}`;
  const l = link
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  return `l:${l}`;
}
