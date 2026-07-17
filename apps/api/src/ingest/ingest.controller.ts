import { Controller, Post } from '@nestjs/common';
import { IngestService, IngestResult } from './ingest.service';

@Controller('ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  /** Disparo manual de la ingesta (ESC-01). Protegido por ApiKeyGuard si API_KEY está configurada. */
  @Post()
  run(): Promise<IngestResult> {
    return this.ingest.ingestAll();
  }
}
