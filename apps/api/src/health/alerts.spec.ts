import { AlertsService, humanize } from './alerts.service';

// Prisma y Config falsos: probamos la lógica de avisos sin base de datos.
const makeService = (opts: {
  feeds?: { id: string; title: string; url: string; errorStreak: number; lastError: string | null }[];
  lastFinishedAt?: Date | null;
  cron?: string;
}) => {
  const prisma = {
    feed: { findMany: jest.fn(async () => opts.feeds ?? []) },
    ingestLog: {
      findFirst: jest.fn(async () => (opts.lastFinishedAt ? { finishedAt: opts.lastFinishedAt } : null)),
    },
  };
  const config = { get: (k: string) => (k === 'INGEST_CRON' ? opts.cron : undefined) };
  return new AlertsService(prisma as never, config as never);
};

describe('humanize', () => {
  it('formatea minutos, horas, días y semanas', () => {
    expect(humanize(30 * 60_000)).toBe('30 min');
    expect(humanize(3 * 3600_000)).toBe('3 h');
    expect(humanize(3 * 86_400_000)).toBe('3 días');
    expect(humanize(21 * 86_400_000)).toBe('3 semanas');
  });
});

describe('AlertsService', () => {
  it('lee el intervalo del cron (campo de minutos */N)', () => {
    expect(makeService({ cron: '0 */30 * * * *' }).cycleMinutes()).toBe(30);
    expect(makeService({ cron: '0 */15 * * * *' }).cycleMinutes()).toBe(15);
    expect(makeService({ cron: undefined }).cycleMinutes()).toBe(30); // default
  });

  it('avisa de una fuente caída y sube de escalón conforme empeora', async () => {
    const feed = { id: 'f1', title: 'BAIR', url: 'https://x', errorStreak: 845, lastError: 'timeout' };
    const alerts = await makeService({ feeds: [feed], lastFinishedAt: new Date() }).list();

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'feed_failing', feedId: 'f1', dismissible: true });
    // 845 ciclos supera los 3 escalones (6, 48, 336) → escalón 3
    expect(alerts[0].fingerprint).toBe('feed:f1:3');
  });

  it('la huella cambia de escalón: ignorar a las 3 h vuelve a avisar al día', async () => {
    const at = (streak: number) =>
      makeService({ feeds: [{ id: 'f1', title: 'X', url: 'u', errorStreak: streak, lastError: null }], lastFinishedAt: new Date() })
        .list()
        .then((a) => a[0].fingerprint);
    expect(await at(6)).toBe('feed:f1:1');
    expect(await at(47)).toBe('feed:f1:1'); // mismo escalón → sigue ignorado
    expect(await at(48)).toBe('feed:f1:2'); // escalón nuevo → vuelve a avisar
  });

  it('no avisa de la ingesta si el último ciclo es reciente', async () => {
    const alerts = await makeService({ lastFinishedAt: new Date(Date.now() - 20 * 60_000) }).list();
    expect(alerts.find((a) => a.kind === 'ingest_stale')).toBeUndefined();
  });

  it('avisa (sin poder ignorarse) si la ingesta lleva horas sin completar un ciclo', async () => {
    const alerts = await makeService({ lastFinishedAt: new Date(Date.now() - 6 * 3600_000) }).list();
    const stale = alerts.find((a) => a.kind === 'ingest_stale');
    expect(stale).toMatchObject({ level: 'error', dismissible: false });
    expect(stale!.title).toContain('6 h');
  });
});
