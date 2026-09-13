import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { execSync } from 'child_process';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';

// commit desplegado, resuelto una vez al arrancar (el repo vive dos niveles arriba)
const VERSION = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '?';
  }
})();

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  /** Avisos de salud para la app: fuentes caídas e ingesta parada. */
  @Get('alerts')
  listAlerts() {
    return this.alerts.list();
  }

  /** FE-05: si la BD no responde → 503. Incluye el commit desplegado. */
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' as const, version: VERSION };
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
  }
}
