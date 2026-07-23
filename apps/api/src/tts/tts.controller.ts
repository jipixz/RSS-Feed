import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, ServiceUnavailableException } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { TtsEngine, TtsService } from './tts.service';

class EngineQueryDto {
  @IsIn(['piper', 'kokoro'])
  engine!: TtsEngine;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9._-]+$/)
  voice?: string;
}

class SayDto {
  @IsString()
  @Length(1, 3000)
  text!: string;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9._-]+$/)
  voice?: string;

  @IsOptional()
  @IsIn(['piper', 'kokoro'])
  engine?: TtsEngine;
}

@Controller('tts')
export class TtsController {
  constructor(private readonly tts: TtsService) {}

  /** Voces disponibles por motor (piper: escanea data/tts-voices). */
  @Get('voices')
  voices() {
    return this.tts.voices();
  }

  /** TTS al vuelo para el minichat (sin caché). Va ANTES de :id. */
  @Post('say')
  async say(@Body() body: SayDto, @Res() res: Response) {
    try {
      const { audio, format } = await this.tts.say(body.text, body.voice, body.engine ?? 'kokoro');
      res.setHeader('content-type', format === 'mp3' ? 'audio/mpeg' : 'audio/wav');
      res.setHeader('cache-control', 'no-store');
      res.send(audio);
    } catch (err) {
      throw new ServiceUnavailableException((err as Error).message);
    }
  }

  /** Genera (o reutiliza) el audio del artículo con el motor y voz elegidos. */
  @Post(':id')
  start(@Param('id') id: string, @Query() query: EngineQueryDto) {
    return this.tts.start(id, query.engine, query.voice);
  }

  @Get(':id/status')
  status(@Param('id') id: string, @Query() query: EngineQueryDto) {
    return this.tts.status(id, query.engine, query.voice);
  }

  /** Sirve el audio con soporte de Range (seek/scrubbing en el player). */
  @Get(':id/file')
  file(@Param('id') id: string, @Query() query: EngineQueryDto, @Res() res: Response) {
    const st = this.tts.status(id, query.engine, query.voice);
    if (st.status !== 'ready' || !st.format) throw new NotFoundException('Audio no generado aún');
    const path = this.tts.resolvedPath(id, query.engine, query.voice, st.format);
    if (!existsSync(path)) throw new NotFoundException('Archivo de audio no encontrado');
    res.setHeader('content-type', st.format === 'mp3' ? 'audio/mpeg' : 'audio/wav');
    res.setHeader('cache-control', 'private, max-age=86400');
    res.sendFile(path);
  }
}
