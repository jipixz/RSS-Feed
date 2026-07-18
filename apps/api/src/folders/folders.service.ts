import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { excludeMutesWhere } from '../common/mute-filter';

export interface FolderDto {
  key: string;
  label: string;
  unreadCount: number;
}

@Injectable()
export class FoldersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sidebar: carpetas con contador de no leídos (excluye silenciados — RN-02). */
  async list(): Promise<FolderDto[]> {
    const [folders, mutes] = await Promise.all([
      this.prisma.folder.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.mute.findMany({ select: { term: true } }),
    ]);
    const muteWhere = excludeMutesWhere(mutes.map((m) => m.term));

    return Promise.all(
      folders.map(async (folder) => ({
        key: folder.key,
        label: folder.label,
        unreadCount: await this.prisma.article.count({
          where: { AND: [{ isRead: false, feed: { folderId: folder.id } }, muteWhere] },
        }),
      })),
    );
  }

  /** ESC-11 extendido: temas nuevos definidos por el usuario. */
  async create(label: string): Promise<FolderDto> {
    const key = this.slugify(label);
    if (!key) throw new BadRequestException('Nombre de carpeta inválido');

    const existing = await this.prisma.folder.findUnique({ where: { key } });
    if (existing) throw new ConflictException('Ya existe una carpeta con ese nombre');

    const max = await this.prisma.folder.aggregate({ _max: { sortOrder: true } });
    const folder = await this.prisma.folder.create({
      data: { key, label, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    return { key: folder.key, label: folder.label, unreadCount: 0 };
  }

  async remove(key: string): Promise<{ ok: true }> {
    const folder = await this.prisma.folder.findUnique({
      where: { key },
      include: { _count: { select: { feeds: true } } },
    });
    if (!folder) throw new NotFoundException('Carpeta no encontrada');
    if (folder._count.feeds > 0) {
      throw new BadRequestException('La carpeta tiene fuentes — elimínalas o muévelas primero');
    }
    await this.prisma.folder.delete({ where: { id: folder.id } });
    return { ok: true };
  }

  private slugify(label: string): string {
    return label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // quita acentos (diacríticos combinantes)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
  }
}
