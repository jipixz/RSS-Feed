import { Controller, Get, Inject, MessageEvent, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
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
    return this.events.stream().pipe(map((event) => ({ data: event }) as MessageEvent));
  }
}
