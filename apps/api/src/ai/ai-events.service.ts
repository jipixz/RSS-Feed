import { Injectable } from '@nestjs/common';
import { Observable, Subject, concat, from } from 'rxjs';

export type AiEvent =
  | { type: 'start'; id: string; title: string; source: string; model: string; prompt: string; at: string }
  | { type: 'done'; id: string; title: string; tldr: string; tokens: number | null; ms: number; at: string }
  | { type: 'error'; id: string; title: string; message: string; at: string }
  | { type: 'cycle'; summarized: number; failed: number; budgetLeft: number; at: string };

const BUFFER_MAX = 40;

/**
 * Bus de eventos de resumen IA. El SummarizerService emite aquí y la consola
 * en vivo (SSE) los consume. Guarda un buffer para que un cliente recién
 * conectado vea la actividad reciente.
 */
@Injectable()
export class AiEventsService {
  private readonly subject = new Subject<AiEvent>();
  private readonly buffer: AiEvent[] = [];

  emit(event: AiEvent) {
    this.buffer.push(event);
    if (this.buffer.length > BUFFER_MAX) this.buffer.shift();
    this.subject.next(event);
  }

  /** Buffer reciente seguido del stream en vivo. */
  stream(): Observable<AiEvent> {
    return concat(from([...this.buffer]), this.subject.asObservable());
  }
}
