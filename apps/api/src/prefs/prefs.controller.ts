import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

class UpdatePrefsDto {
  @IsIn(['light', 'dark'])
  theme!: 'light' | 'dark';
}

/** ESC-13: preferencia de tema persistida (fila singleton). */
@Controller('prefs')
export class PrefsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const pref = await this.prisma.userPref.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    return { theme: pref.theme };
  }

  @Patch()
  async update(@Body() body: UpdatePrefsDto) {
    const pref = await this.prisma.userPref.upsert({
      where: { id: 'singleton' },
      update: { theme: body.theme },
      create: { id: 'singleton', theme: body.theme },
    });
    return { theme: pref.theme };
  }
}
