// Color de la fuente derivado de la carpeta (design tokens de Señal)
const FOLDER_DOT: Record<string, string> = {
  ai: '#0082A6', // brand.blue
  dev: '#3BBEB4', // brand.teal
  sql: '#F79962', // coral.300
  sec: '#D43F0E', // coral.600
};

export function dotColorFor(folderKey: string): string {
  return FOLDER_DOT[folderKey] ?? '#9AA5B1'; // slate.400 fallback
}
