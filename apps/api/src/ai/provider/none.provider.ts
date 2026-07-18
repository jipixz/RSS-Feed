import { AiProvider, SummaryResult } from './ai-provider.interface';

/** TL;DR desactivado: los artículos quedan 'skipped' y se leen sin resumen. */
export class NoneProvider implements AiProvider {
  readonly name = 'none';
  readonly modelLabel = 'desactivado';

  isEnabled(): boolean {
    return false;
  }

  summarize(): Promise<SummaryResult> {
    return Promise.reject(new Error('Proveedor de IA desactivado'));
  }
}
