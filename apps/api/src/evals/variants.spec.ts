// Tests de las variantes de prompt del experimento. Corren en CI.
//
// Lo que protegen: las variantes se DERIVAN del prompt de producción por
// reemplazo de texto. Si alguien reescribe el prompt real, la derivación puede
// quedar silenciosamente mal y el experimento mediría otra cosa sin avisar.
// Estos tests convierten eso en un build rojo.

import { SUMMARY_SYSTEM_PROMPT } from '../ai/provider/prompt';
import { DEFAULT_VARIANT, VARIANTS, resolveVariant } from './variants';

describe('variantes de prompt', () => {
  it('la variante de producción es el prompt real, sin copiarlo', () => {
    // Si esto falla, el brazo de control del experimento no es el control.
    expect(VARIANTS[DEFAULT_VARIANT].prompt).toBe(SUMMARY_SYSTEM_PROMPT);
  });

  it('la derivación del límite duro sigue encontrando la línea que reemplaza', () => {
    // Este es el test que importa: si el prompt de producción cambia su línea
    // de longitud, `hardLength()` lanza en vez de devolver algo parecido.
    expect(() => VARIANTS['hard-length'].prompt).not.toThrow();
    expect(VARIANTS['hard-length'].prompt).not.toBe(SUMMARY_SYSTEM_PROMPT);
  });

  it('el límite duro exige la longitud y ya no la sugiere', () => {
    const p = VARIANTS['hard-length'].prompt;
    expect(p).toMatch(/MÁXIMO 45 PALABRAS/);
    expect(p).toMatch(/límite es estricto/);
    expect(p).not.toMatch(/no te pases/);
  });

  it('el límite duro NO dice qué sacrificar al recortar', () => {
    // Es el punto del brazo: mide si forzar el recorte rompe la atribución por
    // sí solo. Si colara la regla de prioridad, mediría las dos cosas juntas.
    expect(VARIANTS['hard-length'].prompt).not.toMatch(/nunca quites la marca de duda/);
  });

  it('la variante con prioridad añade la regla de qué recortar primero', () => {
    const p = VARIANTS['hard-length-priority'].prompt;
    expect(p).toMatch(/MÁXIMO 45 PALABRAS/);
    expect(p).toMatch(/nunca quites la marca de duda ni la atribución/);
  });

  it('todas las variantes conservan la regla de certeza', () => {
    // Sin esta regla el eval no mide nada: la atribución se caería en todos los
    // brazos por igual y parecería un problema de longitud.
    for (const id of Object.keys(VARIANTS)) {
      expect(VARIANTS[id].prompt).toMatch(/Conserva el grado de certeza del original/);
      expect(VARIANTS[id].prompt).toMatch(/según un reporte/);
    }
  });

  it('todas las variantes piden el resumen a secas, sin preámbulo', () => {
    for (const id of Object.keys(VARIANTS)) {
      expect(VARIANTS[id].prompt).toMatch(/SOLO el resumen, sin preámbulo/);
    }
  });

  it('una variante inexistente falla con las opciones en el mensaje', () => {
    expect(() => resolveVariant('mas-corto-porfa')).toThrow(/Variante de prompt desconocida/);
    expect(() => resolveVariant('mas-corto-porfa')).toThrow(/hard-length/);
  });

  it('cada variante declara qué hipótesis prueba', () => {
    // El snapshot guarda `promptVariant`; el reporte necesita poder explicar
    // para qué existía cada brazo meses después.
    for (const id of Object.keys(VARIANTS)) {
      expect(VARIANTS[id].id).toBe(id);
      expect(VARIANTS[id].tests.length).toBeGreaterThan(20);
    }
  });
});
