import { BadRequestException, Body, Controller, Get, Inject, Logger, MessageEvent, Post, ServiceUnavailableException, Sse } from '@nestjs/common';
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

  private readonly logger = new Logger(AiController.name);

  /** Traduce/explica una selección de texto bajo demanda (para lectura asistida). */
  @Post('translate')
  async translate(@Body() body: TranslateDto): Promise<{ translation: string }> {
    if (!this.provider.isEnabled()) throw new BadRequestException('La IA está desactivada');
    try {
      // timeout amplio: la carga en frío del modelo + una cola de resúmenes pueden tardar
      const { text } = await this.provider.chat(TRANSLATE_SYSTEM, body.text, { maxTokens: 700, timeoutMs: 120_000 });
      return { translation: text };
    } catch (err) {
      const e = err as Error;
      this.logger.warn(`Traducción falló: ${e.name}: ${e.message}`);
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new ServiceUnavailableException(
          'El modelo tardó demasiado (se está cargando o está ocupado resumiendo). Espera unos segundos y reintenta.',
        );
      }
      if (e.message.includes('fetch failed')) {
        throw new ServiceUnavailableException('No se pudo conectar con Ollama — ¿la PC del modelo está encendida?');
      }
      throw new ServiceUnavailableException(`No se pudo traducir: ${e.message}`);
    }
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
