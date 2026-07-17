import { FactoryProvider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER, AiProvider } from './ai-provider.interface';
import { OllamaProvider } from './ollama.provider';
import { AnthropicProvider } from './anthropic.provider';
import { NoneProvider } from './none.provider';

export const aiProviderFactory: FactoryProvider<AiProvider> = {
  provide: AI_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AiProvider => {
    const logger = new Logger('AiProviderFactory');
    const kind = (config.get<string>('AI_PROVIDER') ?? 'none').toLowerCase();
    switch (kind) {
      case 'ollama': {
        const provider = new OllamaProvider(config);
        logger.log(`Proveedor de IA: ollama (${provider.describe()})`);
        return provider;
      }
      case 'anthropic': {
        logger.log('Proveedor de IA: anthropic (claude-haiku-4-5)');
        return new AnthropicProvider(config);
      }
      case 'none':
        logger.log('Proveedor de IA: none — TL;DR desactivado');
        return new NoneProvider();
      default:
        logger.warn(`AI_PROVIDER desconocido "${kind}" — usando none`);
        return new NoneProvider();
    }
  },
};
