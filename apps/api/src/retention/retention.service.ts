import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * RN-06: purga diaria — artículos leídos, NO guardados y con fetchedAt más
 * viejo que RETENTION_DAYS. Los guardados y los no leídos nunca se purgan.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 30 3 * * *') // diario a las 03:30
  async purge(): Promise<number> {
    const days = Number(this.config.get('RETENTION_DAYS') ?? 30);
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.prisma.article.deleteMany({
      where: {
        isRead: true,
        isStarred: false,
        fetchedAt: { lt: threshold },
      },
    });
    if (result.count > 0) {
      this.logger.log(JSON.stringify({ event: 'purge', deleted: result.count, retentionDays: days }));
    }
    return result.count;
  }
}
