/**
 * Perfil de intereses por defecto (se puede editar desde la UI → se guarda en
 * UserPref.interests). Mezcla ES/EN porque la mayoría de feeds están en inglés.
 */
export const DEFAULT_INTERESTS: string[] = [
  // dev web / stack
  'javascript', 'typescript', 'node', 'next.js', 'nextjs', 'nestjs', 'react', 'prisma',
  'sqlite', 'mongodb', 'sql server', 'postgres', 'api',
  // ia / datos
  'ai', ' ia ', 'llm', 'machine learning', 'inteligencia artificial', 'claude', 'gpt', 'gemini',
  'ollama', 'data engineering', 'ingeniería de datos', 'business intelligence', 'etl', 'pipeline',
  // iot / hardware
  'iot', 'domótica', 'domotica', 'smart home', 'home assistant', 'raspberry', 'esp32', 'arduino',
  '3d print', 'impresión 3d', 'impresion 3d',
  // seguridad
  'vulnerabilit', 'vulnerabilidad', 'cve-', 'exploit', 'leak', 'breach', 'ransomware', 'zero-day',
  // otros
  'remote work', 'trabajo remoto', 'android', 'pixel', 'tesla', 'ev ', 'automotive', 'car',
];

export function parseInterests(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) return arr as string[];
    return null;
  } catch {
    return null;
  }
}
