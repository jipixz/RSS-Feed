import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FOLDERS: { key: string; label: string; sortOrder: number }[] = [
  { key: 'ai', label: 'IA', sortOrder: 1 },
  { key: 'dev', label: 'Desarrollo', sortOrder: 2 },
  { key: 'sql', label: 'SQL Server', sortOrder: 3 },
  { key: 'sec', label: 'Seguridad', sortOrder: 4 },
];

// Anexo A — feeds seed
const FEEDS: { folder: string; title: string; url: string }[] = [
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

async function main() {
  const folderIds = new Map<string, string>();
  for (const f of FOLDERS) {
    const folder = await prisma.folder.upsert({
      where: { key: f.key },
      update: { label: f.label, sortOrder: f.sortOrder },
      create: f,
    });
    folderIds.set(f.key, folder.id);
  }

  for (const feed of FEEDS) {
    await prisma.feed.upsert({
      where: { url: feed.url },
      update: {},
      create: {
        url: feed.url,
        title: feed.title,
        folderId: folderIds.get(feed.folder)!,
      },
    });
  }

  await prisma.userPref.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', theme: 'light' },
  });

  console.log(`Seed listo: ${FOLDERS.length} carpetas, ${FEEDS.length} feeds.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
