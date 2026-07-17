import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { SummarizerService } from './summarizer.service';
import { AI_PROVIDER } from './provider/ai-provider.interface';
import { aiProviderFactory } from './provider/ai-provider.factory';

@Module({
  imports: [ContentModule],
  providers: [SummarizerService, aiProviderFactory],
  exports: [SummarizerService],
})
export class AiModule {}
