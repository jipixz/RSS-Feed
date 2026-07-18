// Preferencias por dispositivo (localStorage): lectura y gestos

export interface ReadingPrefs {
  size: 0 | 1 | 2 | 3; // S M L XL
  serif: boolean;
}

export type SwipeAction = 'read' | 'star' | 'none';

export interface GesturePrefs {
  right: SwipeAction; // deslizar a la derecha
  left: SwipeAction; // deslizar a la izquierda
}

export const READING_SIZES = [15, 16.5, 18, 20] as const;

const READ_KEY = 'senal.reading';
const GESTURE_KEY = 'senal.gestures';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

export const loadReading = (): ReadingPrefs => load(READ_KEY, { size: 1 as const, serif: false });
export const saveReading = (p: ReadingPrefs) => localStorage.setItem(READ_KEY, JSON.stringify(p));

export const loadGestures = (): GesturePrefs => load(GESTURE_KEY, { right: 'read' as const, left: 'star' as const });
export const saveGestures = (p: GesturePrefs) => localStorage.setItem(GESTURE_KEY, JSON.stringify(p));
