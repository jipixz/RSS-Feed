import { Module } from '@nestjs/common';
import { FeedsController } from './feeds.controller';
import { OpmlController } from './opml.controller';
import { FeedsService } from './feeds.service';

@Module({
  controllers: [FeedsController, OpmlController],
  providers: [FeedsService],
})
export class FeedsModule {}
