import { Injectable } from '@nestjs/common';
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
}
