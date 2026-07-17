import { Module } from '@nestjs/common';
import { ExtractorService } from './extractor.service';
import { SanitizerService } from './sanitizer.service';

@Module({
  providers: [ExtractorService, SanitizerService],
  exports: [ExtractorService, SanitizerService],
})
export class ContentModule {}
