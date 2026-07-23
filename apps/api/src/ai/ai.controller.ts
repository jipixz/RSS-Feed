import { BadRequestException, Body, Controller, Get, Inject, Logger, MessageEvent, Post, ServiceUnavailableException, Sse } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, Length, ValidateNested } from 'class-validator';
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

const CHAT_SYSTEM = `Eres el asistente del lector RSS "Señal". Conversas en español, de forma
directa y útil, con un desarrollador. Respuestas breves (2-6 frases) salvo que pidan detalle.
Puedes usar viñetas o código cuando ayude. No inventes datos; si no sabes, dilo.`;

class ChatTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @Length(1, 4000)
  content!: string;
}

// Contexto acotado a propósito: el minichat es esporádico, no una sesión larga.
class ChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  messages!: ChatTurnDto[];
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

  /** Minichat con el modelo. El historial viaja completo (acotado) en cada petición. */
  @Post('chat')
  async chat(@Body() body: ChatDto): Promise<{ reply: string }> {
    if (!this.provider.isEnabled()) throw new BadRequestException('La IA está desactivada');
    if (body.messages[body.messages.length - 1].role !== 'user') {
      throw new BadRequestException('El último mensaje debe ser del usuario');
    }
    // El historial se serializa en el prompt de usuario: funciona igual con
    // cualquier proveedor sin extender la interfaz para una charla ligera.
    const transcript = body.messages
      .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
      .join('\n\n');
    const user =
      body.messages.length === 1
        ? body.messages[0].content
        : `${transcript}\n\nResponde al último mensaje del usuario continuando la conversación.`;

    const t0 = Date.now();
    this.events.emit({ type: 'start', id: 'minichat', title: 'Minichat', source: 'chat', model: this.provider.modelLabel, prompt: user, at: new Date().toISOString() });
    try {
      const { text, tokensUsed } = await this.provider.chat(CHAT_SYSTEM, user, { maxTokens: 1000, timeoutMs: 120_000 });
      this.events.emit({ type: 'done', id: 'minichat', title: 'Minichat', tldr: text, tokens: tokensUsed, ms: Date.now() - t0, at: new Date().toISOString() });
      return { reply: text };
    } catch (err) {
      const e = err as Error;
      this.logger.warn(`Minichat falló: ${e.name}: ${e.message}`);
      this.events.emit({ type: 'error', id: 'minichat', title: 'Minichat', message: e.message, at: new Date().toISOString() });
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new ServiceUnavailableException('El modelo tardó demasiado — reintenta en unos segundos.');
      }
      if (e.message.includes('fetch failed')) {
        throw new ServiceUnavailableException('No se pudo conectar con Ollama — ¿la PC del modelo está encendida?');
      }
      throw new ServiceUnavailableException(`El chat falló: ${e.message}`);
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
