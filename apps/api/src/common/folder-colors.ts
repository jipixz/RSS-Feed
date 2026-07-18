// Color de la fuente derivado de la carpeta (design tokens de Señal)
const FOLDER_DOT: Record<string, string> = {
  ai: '#0082A6', // brand.blue
  dev: '#3BBEB4', // brand.teal
  sql: '#F79962', // coral.300
  sec: '#D43F0E', // coral.600
};

// Paleta para carpetas creadas por el usuario — estable por hash del key
const EXTRA_PALETTE = ['#4FBFD9', '#196C69', '#6BD2C6', '#005674', '#D97706', '#7C6FD9'];

export function dotColorFor(folderKey: string): string {
  const known = FOLDER_DOT[folderKey];
  if (known) return known;
  let hash = 0;
  for (const ch of folderKey) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA_PALETTE[hash % EXTRA_PALETTE.length];
}
