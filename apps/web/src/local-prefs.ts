// Preferencias por dispositivo (localStorage): lectura y gestos

export interface ReadingPrefs {
  size: 0 | 1 | 2 | 3; // S M L XL
  width: 0 | 1 | 2 | 3; // ancho de la columna de texto: Estrecho / Medio / Ancho / Completo
  serif: boolean;
}

export type SwipeAction = 'read' | 'star' | 'none';

export interface GesturePrefs {
  right: SwipeAction; // deslizar a la derecha
  left: SwipeAction; // deslizar a la izquierda
}

export const READING_SIZES = [15, 16.5, 18, 20] as const;
// Ancho máximo de la columna de lectura en px; el último (Infinity) = usa todo el panel.
// Útil en pantallas 1080p/1440p donde 680px se ve muy estrecho.
export const READING_WIDTHS = [640, 760, 920, Infinity] as const;
export const READING_WIDTH_LABELS = ['Estrecho', 'Medio', 'Ancho', 'Completo'] as const;

const READ_KEY = 'senal.reading';
const GESTURE_KEY = 'senal.gestures';
const ACCENT_KEY = 'senal.accent';
const SIDEBAR_KEY = 'senal.sidebarW';

// Presets de color de acento (resaltado): marca + variantes comunes.
export const ACCENT_PRESETS: { id: string; label: string; color: string }[] = [
  { id: 'blue', label: 'Azul (marca)', color: '#0084ff' },
  { id: 'sky', label: 'Cielo', color: '#31adff' },
  { id: 'violet', label: 'Violeta', color: '#e872ff' },
  { id: 'green', label: 'Verde', color: '#22c55e' },
  { id: 'amber', label: 'Ámbar', color: '#f59e0b' },
  { id: 'rose', label: 'Rosa', color: '#ec4899' },
  { id: 'red', label: 'Rojo', color: '#ef4444' },
];

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = 236;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

export const loadReading = (): ReadingPrefs => load(READ_KEY, { size: 1 as const, width: 0 as const, serif: false });
export const saveReading = (p: ReadingPrefs) => localStorage.setItem(READ_KEY, JSON.stringify(p));

export const loadGestures = (): GesturePrefs => load(GESTURE_KEY, { right: 'read' as const, left: 'star' as const });
export const saveGestures = (p: GesturePrefs) => localStorage.setItem(GESTURE_KEY, JSON.stringify(p));

/** Color de acento personalizado (hex) o null = usa el del tema. */
export const loadAccent = (): string | null => localStorage.getItem(ACCENT_KEY);
export const saveAccent = (hex: string | null) => {
  if (hex) localStorage.setItem(ACCENT_KEY, hex);
  else localStorage.removeItem(ACCENT_KEY);
};

export const loadSidebarWidth = (): number => {
  const n = Number(localStorage.getItem(SIDEBAR_KEY));
  return Number.isFinite(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX ? n : SIDEBAR_DEFAULT;
};
export const saveSidebarWidth = (w: number) => localStorage.setItem(SIDEBAR_KEY, String(Math.round(w)));
