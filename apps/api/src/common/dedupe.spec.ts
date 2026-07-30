// Test unitario de una FUNCIÓN PURA (misma entrada → misma salida, sin BD ni red).
// Nota: describe/it/expect NO son "lenguaje de Jest": son funciones JS que Jest
// define como globales antes de correr este archivo.

import { dedupeKey } from './dedupe';

// describe(nombre, fn) agrupa tests relacionados. Es solo organización/legibilidad.
describe('dedupeKey', () => {
  // it(nombre, fn) es UN caso de prueba. Se lee como frase: "genera la misma clave…".
  it('genera la misma clave para la misma noticia con acentos/símbolos distintos', () => {
    const a = dedupeKey('GitLab RCE PoC!', 'https://sitio-a.com/x');
    const b = dedupeKey('gitlab   rce   poc', 'https://sitio-b.com/y');
    // expect(valor).toBe(esperado) es la aserción: si no son iguales, el test falla (rojo).
    expect(a).toBe(b);
  });

  it('distingue noticias diferentes', () => {
    const a = dedupeKey('Novedades de PostgreSQL 18', 'https://a.com');
    const b = dedupeKey('Ataque ransomware a hospital', 'https://b.com');
    // .not invierte la aserción
    expect(a).not.toBe(b);
  });

  it('usa el título (prefijo t:) cuando es suficientemente largo', () => {
    // toMatch acepta una expresión regular
    expect(dedupeKey('Un título bien largo y descriptivo', 'https://a.com')).toMatch(/^t:/);
  });

  it('cae al link normalizado (prefijo l:) cuando el título es muy corto', () => {
    // quita protocolo, www, query/hash y slash final
    expect(dedupeKey('Go', 'https://www.ejemplo.com/post/?utm=x#top')).toBe('l:ejemplo.com/post');
  });

  it('dos títulos cortos con el mismo link se consideran la misma noticia', () => {
    expect(dedupeKey('Go', 'https://x.com/a')).toBe(dedupeKey('C', 'https://x.com/a'));
  });
});
