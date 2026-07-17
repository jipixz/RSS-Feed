import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Mismos datos que prisma/seed.ts — duplicados a propósito para que el
// contenedor en la Pi se auto-inicialice sin herramientas de dev (tsx).
const FOLDERS = [
  { key: 'ai', label: 'IA', sortOrder: 1 },
  { key: 'dev', label: 'Desarrollo', sortOrder: 2 },
  { key: 'sql', label: 'SQL Server', sortOrder: 3 },
  { key: 'sec', label: 'Seguridad', sortOrder: 4 },
];

const FEEDS = [
  { folder: 'ai', title: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
  { folder: 'ai', title: 'Import AI', url: 'https://importai.substack.com/feed' },
  { folder: 'ai', title: 'Ahead of AI', url: 'https://magazine.sebastianraschka.com/feed' },
  { folder: 'ai', title: 'Latent Space', url: 'https://www.latent.space/feed' },
  { folder: 'dev', title: 'The Pragmatic Engineer', url: 'https://newsletter.pragmaticengineer.com/feed' },
  { folder: 'dev', title: 'Hacker News', url: 'https://news.ycombinator.com/rss' },
  { folder: 'dev', title: 'Lobsters', url: 'https://lobste.rs/rss' },
  { folder: 'dev', title: 'Node.js Blog', url: 'https://nodejs.org/en/feed/blog.xml' },
  { folder: 'dev', title: 'TypeScript (MS DevBlogs)', url: 'https://devblogs.microsoft.com/typescript/feed/' },
  { folder: 'dev', title: '.NET (MS DevBlogs)', url: 'https://devblogs.microsoft.com/dotnet/feed/' },
  { folder: 'sql', title: 'Brent Ozar', url: 'https://www.brentozar.com/feed/' },
  { folder: 'sec', title: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
  { folder: 'sec', title: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
  { folder: 'sec', title: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
  { folder: 'sec', title: 'SecurityWeek', url: 'https://www.securityweek.com/feed/' },
  { folder: 'sec', title: 'SANS ISC', url: 'https://isc.sans.edu/rssfeed.xml' },
];

/** Si la BD está vacía (primer arranque en la Pi), siembra carpetas y feeds del Anexo A. */
@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const folderCount = await this.prisma.folder.count();
    if (folderCount > 0) return;

    this.logger.log('BD vacía — sembrando carpetas y feeds iniciales (Anexo A)');
    const folderIds = new Map<string, string>();
    for (const f of FOLDERS) {
      const folder = await this.prisma.folder.create({ data: f });
      folderIds.set(f.key, folder.id);
    }
    for (const feed of FEEDS) {
      await this.prisma.feed.create({
        data: { url: feed.url, title: feed.title, folderId: folderIds.get(feed.folder)! },
      });
    }
    await this.prisma.userPref.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton', theme: 'light' },
    });
    this.logger.log(`Seed listo: ${FOLDERS.length} carpetas, ${FEEDS.length} feeds`);
  }
}
