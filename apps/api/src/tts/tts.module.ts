import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';

@Module({
  imports: [ContentModule],
  controllers: [TtsController],
  providers: [TtsService],
})
export class TtsModule {}
