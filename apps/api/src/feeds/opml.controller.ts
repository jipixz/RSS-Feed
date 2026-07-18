import { BadRequestException, Body, Controller, Get, Header, Post } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { JSDOM } from 'jsdom';
import { PrismaService } from '../prisma/prisma.service';

class ImportOpmlDto {
  @IsString()
  @MaxLength(2_000_000)
  opml!: string;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Export/import OPML — migrar o compartir la lista de fuentes. */
@Controller('opml')
export class OpmlController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Header('content-type', 'text/x-opml; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="senal.opml"')
  async export(): Promise<string> {
    const folders = await this.prisma.folder.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { feeds: { where: { active: true }, orderBy: { title: 'asc' } } },
    });
    const outlines = folders
      .map((folder) => {
        const feeds = folder.feeds
          .map(
            (f) =>
              `      <outline type="rss" text="${escapeXml(f.title)}" title="${escapeXml(f.title)}" xmlUrl="${escapeXml(f.url)}"${f.siteUrl ? ` htmlUrl="${escapeXml(f.siteUrl)}"` : ''}/>`,
          )
          .join('\n');
        return `    <outline text="${escapeXml(folder.label)}" title="${escapeXml(folder.label)}">\n${feeds}\n    </outline>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Señal</title>\n  </head>\n  <body>\n${outlines}\n  </body>\n</opml>\n`;
  }

  @Post('import')
  async import(@Body() body: ImportOpmlDto) {
    let doc: Document;
    try {
      doc = new JSDOM(body.opml, { contentType: 'text/xml' }).window.document;
    } catch {
      throw new BadRequestException('El archivo no es un OPML/XML válido');
    }
    const result = { folders: 0, feeds: 0, skipped: 0 };

    const folderKeyFor = async (label: string): Promise<string> => {
      const key =
        label
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 30) || 'importados';
      const existing = await this.prisma.folder.findUnique({ where: { key } });
      if (existing) return existing.id;
      const max = await this.prisma.folder.aggregate({ _max: { sortOrder: true } });
      const created = await this.prisma.folder.create({
        data: { key, label: label || 'Importados', sortOrder: (max._max.sortOrder ?? 0) + 1 },
      });
      result.folders += 1;
      return created.id;
    };

    // Estructura típica: body > outline (carpeta) > outline[xmlUrl] (feed).
    // También soporta feeds sueltos directamente en body.
    for (const outline of Array.from(doc.querySelectorAll('body > outline'))) {
      const xmlUrl = outline.getAttribute('xmlUrl');
      if (xmlUrl) {
        await this.importFeed(outline, await folderKeyFor('Importados'), result);
      } else {
        const label = outline.getAttribute('title') ?? outline.getAttribute('text') ?? 'Importados';
        const folderId = await folderKeyFor(label);
        for (const child of Array.from(outline.querySelectorAll('outline[xmlUrl]'))) {
          await this.importFeed(child, folderId, result);
        }
      }
    }
    return result;
  }

  private async importFeed(
    node: Element,
    folderId: string,
    result: { feeds: number; skipped: number },
  ) {
    const url = node.getAttribute('xmlUrl')?.trim();
    if (!url || !/^https?:\/\//.test(url)) return;
    const existing = await this.prisma.feed.findUnique({ where: { url } });
    if (existing) {
      result.skipped += 1;
      return;
    }
    const title = node.getAttribute('title') ?? node.getAttribute('text') ?? new URL(url).hostname;
    // No se valida cada feed con un fetch (importar 50 sería eterno);
    // si alguno no parsea, la ingesta lo marcará con lastFetchStatus='error'.
    await this.prisma.feed.create({
      data: { url, title, siteUrl: node.getAttribute('htmlUrl'), folderId },
    });
    result.feeds += 1;
  }
}
