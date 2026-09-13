import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AlertsService } from './alerts.service';

@Module({
  controllers: [HealthController],
  providers: [AlertsService],
})
export class HealthModule {}
