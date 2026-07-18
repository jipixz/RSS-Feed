import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { AiProvider, SummaryResult } from './ai-provider.interface';
import { SUMMARY_SYSTEM_PROMPT } from './prompt';

/**
 * Proveedor Anthropic (claude-haiku-4-5) — listo para activar cambiando
 * AI_PROVIDER=anthropic y poniendo ANTHROPIC_API_KEY en el .env (RS-1: la key
 * vive solo en el servidor).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly modelLabel = 'claude-haiku-4-5';
  private readonly client: Anthropic | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey, timeout: 20_000, maxRetries: 2 }) : null;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async summarize(title: string, text: string): Promise<SummaryResult> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY no configurada');
    const message = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Título: ${title}\n\nArtículo:\n${text}` }],
    });
    const block = message.content.find((c) => c.type === 'text');
    const tldr = block && 'text' in block ? block.text.trim() : '';
    if (!tldr) throw new Error('Claude devolvió una respuesta vacía');
    return {
      tldr,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    };
  }
}
