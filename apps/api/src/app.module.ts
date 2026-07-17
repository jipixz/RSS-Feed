import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
import { PrismaModule } from './prisma/prisma.module';
import { IngestModule } from './ingest/ingest.module';
import { ArticlesModule } from './articles/articles.module';
import { FoldersModule } from './folders/folders.module';
import { FeedsModule } from './feeds/feeds.module';
import { MutesModule } from './mutes/mutes.module';
import { PrefsModule } from './prefs/prefs.module';
import { HealthModule } from './health/health.module';
import { RetentionModule } from './retention/retention.module';
import { ApiKeyGuard } from './common/api-key.guard';

// Build del frontend: apps/web/dist (dev y prod comparten layout de monorepo)
const webDist = join(__dirname, '..', '..', 'web', 'dist');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '..', '..', '.env')],
    }),
    ScheduleModule.forRoot(),
    ...(existsSync(webDist)
      ? [
          ServeStaticModule.forRoot({
            rootPath: webDist,
            exclude: ['/api/{*path}'],
          }),
        ]
      : []),
    PrismaModule,
    IngestModule,
    ArticlesModule,
    FoldersModule,
    FeedsModule,
    MutesModule,
    PrefsModule,
    HealthModule,
    RetentionModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
