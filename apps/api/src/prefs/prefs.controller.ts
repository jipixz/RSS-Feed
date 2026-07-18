import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_INTERESTS, parseInterests } from './interests';

class UpdatePrefsDto {
  @IsOptional()
  @IsIn(['light', 'sepia', 'cafe', 'dark', 'black'])
  theme?: 'light' | 'sepia' | 'cafe' | 'dark' | 'black';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(150)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  interests?: string[];
}

/** ESC-13: preferencias persistidas (tema + perfil de intereses, fila singleton). */
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
    return {
      theme: pref.theme,
      interests: parseInterests(pref.interests) ?? DEFAULT_INTERESTS,
    };
  }

  @Patch()
  async update(@Body() body: UpdatePrefsDto) {
    const data: { theme?: string; interests?: string } = {};
    if (body.theme) data.theme = body.theme;
    if (body.interests) {
      data.interests = JSON.stringify(body.interests.map((t) => t.trim()).filter(Boolean));
    }
    const pref = await this.prisma.userPref.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
    return {
      theme: pref.theme,
      interests: parseInterests(pref.interests) ?? DEFAULT_INTERESTS,
    };
  }
}
