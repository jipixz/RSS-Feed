import { Module } from '@nestjs/common';
import { MutesController } from './mutes.controller';
import { MutesService } from './mutes.service';

@Module({
  controllers: [MutesController],
  providers: [MutesService],
})
export class MutesModule {}
