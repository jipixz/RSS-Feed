import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** ESC-10: gestión de palabras silenciadas. Efecto inmediato en la siguiente lista. */
@Injectable()
export class MutesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<string[]> {
    const mutes = await this.prisma.mute.findMany({ orderBy: { createdAt: 'asc' } });
    return mutes.map((m) => m.term);
  }

  async add(term: string): Promise<string[]> {
    const clean = term.trim();
    if (clean) {
      await this.prisma.mute.upsert({
        where: { term: clean },
        update: {},
        create: { term: clean },
      });
    }
    return this.list();
  }

  async remove(term: string): Promise<string[]> {
    await this.prisma.mute.deleteMany({ where: { term: term.trim() } });
    return this.list();
  }
}
