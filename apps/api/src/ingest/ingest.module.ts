import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { AiModule } from '../ai/ai.module';
import { IngestService } from './ingest.service';
import { IngestScheduler } from './ingest.scheduler';
import { IngestController } from './ingest.controller';

@Module({
  imports: [ContentModule, AiModule],
  providers: [IngestService, IngestScheduler],
  controllers: [IngestController],
  exports: [IngestService],
})
export class IngestModule {}
