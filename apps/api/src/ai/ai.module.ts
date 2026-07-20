import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { SummarizerService } from './summarizer.service';
import { AiEventsService } from './ai-events.service';
import { AiController } from './ai.controller';
import { aiProviderFactory } from './provider/ai-provider.factory';

import { AI_PROVIDER } from './provider/ai-provider.interface';

@Module({
  imports: [ContentModule],
  controllers: [AiController],
  providers: [SummarizerService, AiEventsService, aiProviderFactory],
  exports: [SummarizerService, AI_PROVIDER],
})
export class AiModule {}
