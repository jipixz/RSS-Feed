import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export type AlertKind = 'feed_failing' | 'ingest_stale';

export interface HealthAlert {
  /** Identidad estable del problema (p. ej. "feed:<id>"). */
  id: string;
  /** Cambia cuando el problema empeora de escalón → vuelve a avisar aunque se haya ignorado. */
  fingerprint: string;
  kind: AlertKind;
  level: 'warn' | 'error';
  title: string;
  detail: string;
  /** false = crítico, no se puede ignorar (se quita solo cuando se arregla). */
  dismissible: boolean;
  feedId?: string;
  /** Momento de referencia (ISO), p. ej. el último ciclo completado; el front lo formatea. */
  since?: string;
}

// Escalones de aviso para una fuente caída, en ciclos seguidos fallando.
// Con el cron de 30 min: ~3 h, ~1 día, ~1 semana. Ignorar un aviso lo silencia
// hasta el siguiente escalón.
const FEED_STEPS = [6, 48, 336];
// La ingesta se considera parada si no completa un ciclo en este tiempo
// (o en 4 intervalos del cron, lo que sea mayor).
const STALE_MIN_MS = 2 * 3600_000;

/**
 * Detecta problemas de salud que antes solo se veían en `pm2 logs`: fuentes que
 * llevan mucho fallando y una ingesta que dejó de completar ciclos (cuelgue o
 * crash por memoria). La app los muestra como avisos.
 */
@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Minutos entre ciclos según INGEST_CRON (campo de minutos "*\/N"). */
  cycleMinutes(): number {
    const expr = this.config.get<string>('INGEST_CRON') ?? '0 */30 * * * *';
    const fields = expr.trim().split(/\s+/);
    const minuteField = fields.length === 6 ? fields[1] : fields[0];
    const m = /^\*\/(\d+)$/.exec(minuteField ?? '');
    return m ? Number(m[1]) : 30;
  }

  async list(): Promise<HealthAlert[]> {
    const [feedAlerts, ingestAlert] = await Promise.all([this.feedAlerts(), this.ingestAlert()]);
    // lo crítico primero
    return [...(ingestAlert ? [ingestAlert] : []), ...feedAlerts];
  }

  private async feedAlerts(): Promise<HealthAlert[]> {
    const minutes = this.cycleMinutes();
    const feeds = await this.prisma.feed.findMany({
      where: { active: true, errorStreak: { gte: FEED_STEPS[0] } },
      orderBy: { errorStreak: 'desc' },
      select: { id: true, title: true, url: true, errorStreak: true, lastError: true },
    });
    return feeds.map((f) => {
      const step = FEED_STEPS.filter((s) => f.errorStreak >= s).length; // 1..3
      return {
        id: `feed:${f.id}`,
        fingerprint: `feed:${f.id}:${step}`,
        kind: 'feed_failing' as const,
        level: 'warn' as const,
        title: `"${f.title}" lleva ${humanize(f.errorStreak * minutes * 60_000)} sin poder leerse`,
        detail: `${f.errorStreak} ciclos seguidos fallando · ${f.lastError ?? 'error desconocido'}`,
        dismissible: true,
        feedId: f.id,
      };
    });
  }

  private async ingestAlert(): Promise<HealthAlert | null> {
    const threshold = Math.max(STALE_MIN_MS, 4 * this.cycleMinutes() * 60_000);
    const last = await this.prisma.ingestLog.findFirst({
      where: { finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });

    if (!last?.finishedAt) {
      // BD nueva: solo es problema si el proceso ya lleva un rato arriba
      if (process.uptime() * 1000 < threshold) return null;
      return {
        id: 'ingest_stale',
        fingerprint: 'ingest_stale:never',
        kind: 'ingest_stale',
        level: 'error',
        title: 'La ingesta nunca ha completado un ciclo',
        detail: 'No están entrando artículos nuevos. Revisa los logs del servidor.',
        dismissible: false,
      };
    }

    const age = Date.now() - last.finishedAt.getTime();
    if (age < threshold) return null;
    return {
      id: 'ingest_stale',
      fingerprint: `ingest_stale:${last.finishedAt.toISOString()}`,
      kind: 'ingest_stale',
      level: 'error',
      title: `No entran artículos nuevos desde hace ${humanize(age)}`,
      detail: 'La ingesta puede estar colgada o reiniciándose por falta de memoria.',
      dismissible: false,
      since: last.finishedAt.toISOString(),
    };
  }
}

/** 95 min → "1 h", 3 días → "3 días". Aproximado, para humanos. */
export function humanize(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} días`;
  return `${Math.round(d / 7)} semanas`;
}
