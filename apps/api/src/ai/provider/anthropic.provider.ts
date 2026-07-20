import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { AiProvider, ChatResult, SummaryResult } from './ai-provider.interface';
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

  async chat(system: string, user: string, opts?: { maxTokens?: number }): Promise<ChatResult> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY no configurada');
    const message = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: opts?.maxTokens ?? 200,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const block = message.content.find((c) => c.type === 'text');
    const text = block && 'text' in block ? block.text.trim() : '';
    if (!text) throw new Error('Claude devolvió una respuesta vacía');
    return { text, tokensUsed: message.usage.input_tokens + message.usage.output_tokens };
  }

  async summarize(title: string, text: string): Promise<SummaryResult> {
    const { text: tldr, tokensUsed } = await this.chat(SUMMARY_SYSTEM_PROMPT, `Título: ${title}\n\nArtículo:\n${text}`);
    return { tldr, tokensUsed };
  }
}
