import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { SummarizerService } from './summarizer.service';
import { AiEventsService } from './ai-events.service';
import { EmbeddingService } from './embedding.service';
import { CategorizationService } from './categorization.service';
import { AiController } from './ai.controller';
import { aiProviderFactory } from './provider/ai-provider.factory';

import { AI_PROVIDER } from './provider/ai-provider.interface';

@Module({
  imports: [ContentModule],
  controllers: [AiController],
  providers: [SummarizerService, AiEventsService, EmbeddingService, CategorizationService, aiProviderFactory],
  exports: [SummarizerService, EmbeddingService, CategorizationService, AI_PROVIDER],
})
export class AiModule {}
