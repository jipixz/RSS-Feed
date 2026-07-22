import { BadRequestException, Body, Controller, Get, Inject, MessageEvent, Post, Sse } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Observable, interval, map, merge } from 'rxjs';
import { AiEventsService } from './ai-events.service';
import { AI_PROVIDER, AiProvider } from './provider/ai-provider.interface';
import { SUMMARY_SYSTEM_PROMPT } from './provider/prompt';

const TRANSLATE_SYSTEM = `Eres un traductor técnico inglés→español para un desarrollador.
Traduce al español el texto seleccionado de un artículo técnico, conservando los términos técnicos y el sentido exacto.
Si es una sola palabra o término, tradúcelo y explica brevemente qué significa en ese contexto.
Devuelve SOLO la traducción/explicación, sin preámbulo, sin comillas y sin repetir el original.`;

class TranslateDto {
  @IsString()
  @Length(1, 4000)
  text!: string;
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly events: AiEventsService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  /** Metadatos para la consola: proveedor, modelo y prompt de sistema. */
  @Get('info')
  info() {
    return {
      provider: this.provider.name,
      model: this.provider.modelLabel,
      enabled: this.provider.isEnabled(),
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
    };
  }

  /** Traduce/explica una selección de texto bajo demanda (para lectura asistida). */
  @Post('translate')
  async translate(@Body() body: TranslateDto): Promise<{ translation: string }> {
    if (!this.provider.isEnabled()) throw new BadRequestException('La IA está desactivada');
    const { text } = await this.provider.chat(TRANSLATE_SYSTEM, body.text, { maxTokens: 700 });
    return { translation: text };
  }

  /** Stream de eventos de resumen en vivo (Server-Sent Events). */
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    const events = this.events.stream().pipe(map((event) => ({ data: event }) as MessageEvent));
    // Latido cada 25 s: evita que Cloudflare (idle ~100 s) corte la conexión
    // y dispare una reconexión que re-emitiría el búfer (duplicados).
    const heartbeat = interval(25_000).pipe(map(() => ({ data: { type: 'ping' } }) as MessageEvent));
    return merge(events, heartbeat);
  }
}
