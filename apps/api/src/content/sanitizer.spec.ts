// toSpeech() convierte HTML en texto para el TTS conservando estructura y
// puntuación (para que Kokoro/Piper hagan pausas en vez de leer de corrido).

// jest.mock reemplaza el módulo 'sanitize-html' por una versión falsa ANTES de
// que se importe sanitizer.service. Dos motivos:
//  1) aísla nuestra lógica (pausas/puntuación) del comportamiento de esa librería;
//  2) evita cargar su dependencia pesada en ESM (htmlparser2) que Jest no compila.
// jest.mock se "sube" automáticamente arriba de los imports (hoisting).
jest.mock('sanitize-html', () => {
  // versión falsa: solo quita etiquetas con una regex
  const strip = (html: string) => String(html ?? '').replace(/<[^>]*>/g, '');
  // el constructor de SanitizerService usa simpleTransform en sus opciones;
  // no se ejecuta en toSpeech, basta con que exista para no romper al importar.
  (strip as unknown as { simpleTransform: () => unknown }).simpleTransform = () => () => ({});
  return { __esModule: true, default: strip };
});

import { SanitizerService } from './sanitizer.service';

describe('SanitizerService.toSpeech', () => {
  // Se crea una instancia normal: esta clase no tiene dependencias en el constructor.
  const s = new SanitizerService();

  it('cierra cada bloque con punto para forzar una pausa', () => {
    // el <p> no trae punto final → toSpeech le agrega uno
    expect(s.toSpeech('<p>hola mundo</p>')).toBe('hola mundo.');
  });

  it('separa párrafos en líneas distintas (una pausa entre cada uno)', () => {
    expect(s.toSpeech('<p>uno</p><p>dos</p>')).toBe('uno.\ndos.');
  });

  it('no duplica la puntuación si el texto ya terminaba en punto', () => {
    expect(s.toSpeech('<p>Hola.</p>')).toBe('Hola.');
  });

  it('quita las etiquetas HTML', () => {
    // no debe quedar rastro de <b> ni </b>
    expect(s.toSpeech('<p>texto <b>en negrita</b></p>')).not.toContain('<');
  });

  it('devuelve cadena vacía si no hay contenido', () => {
    expect(s.toSpeech('')).toBe('');
  });
});
