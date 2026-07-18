// Color de la fuente derivado de la carpeta — familia de marca (azul→morado),
// con sec en rosa-rojo para que "seguridad" siga leyéndose como alerta.
const FOLDER_DOT: Record<string, string> = {
  ai: '#0084ff', // brand.blue
  dev: '#31adff', // brand.teal (azul claro)
  sql: '#e872ff', // brand.coral (morado)
  sec: '#ff5470', // alerta
};

// Paleta para carpetas creadas por el usuario — estable por hash del key
const EXTRA_PALETTE = ['#5CBEFF', '#0068d6', '#b366ff', '#00b0d6', '#ff5470', '#8a7cff'];

export function dotColorFor(folderKey: string): string {
  const known = FOLDER_DOT[folderKey];
  if (known) return known;
  let hash = 0;
  for (const ch of folderKey) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA_PALETTE[hash % EXTRA_PALETTE.length];
}
