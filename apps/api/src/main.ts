import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableCors(); // misma red privada; el front en dev corre en :5173
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  // HOST=127.0.0.1 → solo accesible desde la propia máquina (el tunnel de
  // Cloudflare corre en la Pi y conecta por localhost, así que sigue funcionando,
  // pero se cierra el acceso directo por IP de LAN). Default 0.0.0.0 (no rompe nada).
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  new Logger('Bootstrap').log(`Señal API escuchando en http://${host}:${port}`);
}

void bootstrap();
