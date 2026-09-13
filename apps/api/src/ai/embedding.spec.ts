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

// 3) Regresión del OOM en la Pi: antes se cargaban TODOS los embeddings de golpe
//    y reventaba el heap. Ahora se recorren por lotes con cursor.
describe('EmbeddingService por lotes (regresión OOM)', () => {
  const fakeConfig = { get: (k: string) => (k === 'AI_PROVIDER' ? 'ollama' : undefined) };

  // BD falsa en memoria que imita la paginación por cursor de Prisma.
  const makePrisma = (rows: { id: string; vec: number[]; folder: string }[]) => {
    const pageSizes: number[] = [];
    const findMany = jest.fn(async (args: { take: number; cursor?: { id: string }; skip?: number }) => {
      const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
      const start = args.cursor ? sorted.findIndex((r) => r.id === args.cursor!.id) + (args.skip ?? 0) : 0;
      const page = sorted.slice(start, start + args.take).map((r) => ({
        id: r.id,
        embedding: JSON.stringify(r.vec),
        feed: { folder: { key: r.folder } },
      }));
      pageSizes.push(page.length);
      return page;
    });
    return { prisma: { article: { findMany } }, pageSizes, findMany };
  };

  const rows = [
    { id: 'a', vec: [1, 0], folder: 'dev' },
    { id: 'b', vec: [0, 1], folder: 'sec' },
    { id: 'c', vec: [0.9, 0.1], folder: 'dev' },
    { id: 'd', vec: [0.1, 0.9], folder: 'sec' },
    { id: 'e', vec: [0.7, 0.7], folder: 'ai' },
  ];

  it('forEachEmbedding visita todas las filas sin pedir más de un lote por consulta', async () => {
    const { prisma, pageSizes, findMany } = makePrisma(rows);
    const svc = new EmbeddingService(fakeConfig as never, prisma as never);
    const seen: string[] = [];

    await svc.forEachEmbedding((id) => { seen.push(id); }, 2); // lotes de 2

    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd', 'e']); // no se salta ninguna
    expect(Math.max(...pageSizes)).toBeLessThanOrEqual(2); // nunca carga todo de golpe
    expect(findMany).toHaveBeenCalledTimes(3); // 2 + 2 + 1
  });

  it('rank devuelve el top-K por similitud y respeta excludeId', async () => {
    const { prisma } = makePrisma(rows);
    const svc = new EmbeddingService(fakeConfig as never, prisma as never);

    const top = await svc.rank([1, 0], { limit: 2, excludeId: 'a' });

    // 'a' excluido; lo más cercano a [1,0] es 'c' y luego 'e'
    expect(top.map((t) => t.id)).toEqual(['c', 'e']);
  });
});
