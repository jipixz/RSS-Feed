import { EmbeddingService } from './embedding.service';

// 1) La similitud coseno es una función pura estática: fácil de probar con vectores a mano.
describe('EmbeddingService.cosine', () => {
  it('vectores idénticos → 1', () => {
    expect(EmbeddingService.cosine([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it('vectores perpendiculares → 0', () => {
    expect(EmbeddingService.cosine([1, 0], [0, 1])).toBe(0);
  });

  it('vectores opuestos → -1', () => {
    expect(EmbeddingService.cosine([1, 0], [-1, 0])).toBe(-1);
  });

  it('la dirección importa, no la magnitud (mismos sentidos → ~1)', () => {
    // [2,0] y [1,0] apuntan igual → coseno 1 aunque midan distinto
    expect(EmbeddingService.cosine([2, 0], [1, 0])).toBeCloseTo(1); // toBeCloseTo evita problemas de flotantes
  });
});

// 2) Aquí se ve el valor de la INYECCIÓN DE DEPENDENCIAS: le pasamos un ConfigService
//    FALSO por el constructor y probamos la lógica sin Ollama ni base de datos reales.
describe('EmbeddingService (degradación sin Ollama)', () => {
  // "mock" del ConfigService: solo responde lo que nos interesa para el caso.
  const fakeConfig = (provider: string) => ({ get: (k: string) => (k === 'AI_PROVIDER' ? provider : undefined) });
  const fakePrisma = {} as never; // no se usa en estas ramas

  it('con AI_PROVIDER=none, isEnabled() es false', () => {
    const svc = new EmbeddingService(fakeConfig('none') as never, fakePrisma);
    expect(svc.isEnabled()).toBe(false);
  });

  it('desactivado, embed() devuelve null y NO intenta llamar a la red', async () => {
    const svc = new EmbeddingService(fakeConfig('none') as never, fakePrisma);
    // await porque embed es asíncrono (devuelve Promise)
    await expect(svc.embed('cualquier texto')).resolves.toBeNull();
  });

  it('con AI_PROVIDER=ollama, isEnabled() es true', () => {
    const svc = new EmbeddingService(fakeConfig('ollama') as never, fakePrisma);
    expect(svc.isEnabled()).toBe(true);
  });
});
