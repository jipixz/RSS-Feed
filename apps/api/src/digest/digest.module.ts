import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DigestController } from './digest.controller';
import { DigestService } from './digest.service';

@Module({
  imports: [AiModule],
  controllers: [DigestController],
  providers: [DigestService],
})
export class DigestModule {}
