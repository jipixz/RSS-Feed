import { Module } from '@nestjs/common';
import { PrefsController } from './prefs.controller';

@Module({
  controllers: [PrefsController],
})
export class PrefsModule {}
