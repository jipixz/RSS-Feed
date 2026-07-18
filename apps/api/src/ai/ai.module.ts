import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { SummarizerService } from './summarizer.service';
import { AiEventsService } from './ai-events.service';
import { AiController } from './ai.controller';
import { aiProviderFactory } from './provider/ai-provider.factory';

@Module({
  imports: [ContentModule],
  controllers: [AiController],
  providers: [SummarizerService, AiEventsService, aiProviderFactory],
  exports: [SummarizerService],
})
export class AiModule {}
