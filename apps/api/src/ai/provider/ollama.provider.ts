import { ConfigService } from '@nestjs/config';
import { AiProvider, SummaryResult } from './ai-provider.interface';
import { SUMMARY_SYSTEM_PROMPT } from './prompt';

// generoso: la primera petición de cada ciclo puede incluir la carga del modelo (~30 s)
const TIMEOUT_MS = 60_000;

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

/** Ollama corriendo en otra máquina de la red (OLLAMA_BASE_URL). */
export class OllamaProvider implements AiProvider {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.get<string>('OLLAMA_MODEL') ?? 'llama3.2:3b';
  }

  describe(): string {
    return `${this.baseUrl} · ${this.model}`;
  }

  isEnabled(): boolean {
    return true;
  }

  async summarize(title: string, text: string): Promise<SummaryResult> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: { temperature: 0.3, num_predict: 160 },
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Título: ${title}\n\nArtículo:\n${text}` },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as OllamaChatResponse;
    const tldr = data.message?.content?.trim();
    if (!tldr) throw new Error('Ollama devolvió una respuesta vacía');
    return {
      tldr,
      tokensUsed: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0) || null,
    };
  }
}
