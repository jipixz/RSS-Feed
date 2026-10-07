/**
 * Test e2e de /api/health.
 *
 * La diferencia con un test unitario: aquí no se llama al método del
 * controlador a mano. Se levanta una app de Nest real en memoria —con su
 * router, su prefijo global y su capa HTTP— y se le hacen peticiones con
 * supertest. Eso cubre tres cosas que un unitario no ve:
 *
 *  1. Que la ruta sea `/api/health` y no `/health`. El prefijo lo pone
 *     `main.ts`, no el controlador, así que un unitario pasaría aunque la URL
 *     que consume el front estuviera mal.
 *  2. Que `ServiceUnavailableException` se traduzca de verdad a un 503. El
 *     unitario solo vería que se lanza una excepción.
 *  3. La forma exacta del JSON, que es el contrato con el front.
 *
 * Lo único que se sustituye son las dependencias externas (la BD y el servicio
 * de avisos), para que el test sea determinista y no necesite SQLite ni red.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';
import { HealthController } from './health.controller';

describe('/api/health (e2e)', () => {
  let app: INestApplication;

  // `$queryRaw` es el ping a la BD que hace el controlador; `list` son los
  // avisos. Son jest.fn(), así cada test decide si responden o si fallan.
  const queryRaw = jest.fn();
  const list = jest.fn();

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      // El controlador pide PrismaService y AlertsService por constructor.
      // `provide` + `useValue` le entrega estos dobles en su lugar: el token
      // es la clase, pero el objeto que recibe es el nuestro.
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
        { provide: AlertsService, useValue: { list } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mismo arranque que main.ts: si esto se desincroniza, el test deja de
    // probar lo que corre en producción.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    jest.resetAllMocks();
    await app.close();
  });

  it('responde 200 con el commit desplegado cuando la BD contesta', async () => {
    queryRaw.mockResolvedValue([{ 1: 1 }]);

    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.body.status).toBe('ok');
    // La versión sale de `git rev-parse`; en un tarball sin .git el controlador
    // devuelve '?'. Cualquiera de las dos es válida, vacío no.
    expect(typeof res.body.version).toBe('string');
    expect(res.body.version.length).toBeGreaterThan(0);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  // FE-05: el health check existe para que el monitor sepa que la BD murió.
  // Si esto devolviera 200 con la BD caída, no serviría para nada.
  it('responde 503 cuando la BD no contesta', async () => {
    queryRaw.mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));

    const res = await request(app.getHttpServer()).get('/api/health').expect(503);

    expect(res.body.message).toMatch(/base de datos/i);
  });

  it('no filtra el error interno de la BD al cliente', async () => {
    queryRaw.mockRejectedValue(new Error('SQLITE_CANTOPEN: /home/pi/senal/prod.db'));

    const res = await request(app.getHttpServer()).get('/api/health').expect(503);

    // La ruta es pública detrás del tunnel: la respuesta no debe revelar
    // rutas del sistema ni el error crudo de SQLite.
    expect(JSON.stringify(res.body)).not.toMatch(/SQLITE_CANTOPEN|home\/pi/);
  });

  it('devuelve los avisos de salud tal cual los da AlertsService', async () => {
    const alert = {
      id: 'feed:abc',
      fingerprint: 'feed:abc:6',
      kind: 'feed_failing',
      level: 'warn',
      title: 'Hacker News lleva 6 ciclos fallando',
      detail: 'HTTP 503',
      dismissible: true,
    };
    list.mockResolvedValue([alert]);

    const res = await request(app.getHttpServer()).get('/api/health/alerts').expect(200);

    expect(res.body).toEqual([alert]);
  });

  it('con la BD caída los avisos siguen respondiendo', async () => {
    // Son endpoints independientes: que el ping a la BD falle no debe tumbar
    // la lista de avisos, que es justo lo que el usuario necesita ver.
    queryRaw.mockRejectedValue(new Error('caída'));
    list.mockResolvedValue([]);

    await request(app.getHttpServer()).get('/api/health').expect(503);
    await request(app.getHttpServer()).get('/api/health/alerts').expect(200);
  });

  it('no sirve en /health, sin el prefijo /api', async () => {
    queryRaw.mockResolvedValue([{ 1: 1 }]);

    // Regresión del prefijo: el front y el healthcheck de Docker piden
    // /api/health. Si alguien quitara setGlobalPrefix, este test lo caza.
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
