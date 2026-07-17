import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { IngestService } from './ingest.service';

/** ESC-01: dispara la ingesta según INGEST_CRON (default: cada 30 min). */
@Injectable()
export class IngestScheduler implements OnModuleInit {
  private readonly logger = new Logger(IngestScheduler.name);

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly ingest: IngestService,
  ) {}

  onModuleInit() {
    const expression = this.config.get<string>('INGEST_CRON') ?? '0 */30 * * * *';
    const job = new CronJob(expression, () => {
      void this.ingest.ingestAll().catch((err: Error) => this.logger.error(`Ciclo de ingesta falló: ${err.message}`));
    });
    this.registry.addCronJob('ingest', job);
    job.start();
    this.logger.log(`Cron de ingesta activo: "${expression}"`);
  }
}
