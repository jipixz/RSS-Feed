import { Controller, Get, Inject, MessageEvent, Sse } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';
import { AiEventsService } from './ai-events.service';
import { AI_PROVIDER, AiProvider } from './provider/ai-provider.interface';
import { SUMMARY_SYSTEM_PROMPT } from './provider/prompt';

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
