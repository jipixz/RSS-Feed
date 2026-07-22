export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface SummaryResult {
  tldr: string;
  tokensUsed: number | null;
}

export interface ChatResult {
  text: string;
  tokensUsed: number | null;
}

/**
 * Abstracción del proveedor de IA para TL;DR.
 * Implementaciones: ollama (default), anthropic, none.
 * Se elige con la env AI_PROVIDER — cambiar de proveedor no toca código.
 */
export interface AiProvider {
  readonly name: string;
  /** Etiqueta del modelo para la consola (p. ej. "gemma4:latest"). */
  readonly modelLabel: string;
  /** Genera un TL;DR en español (1–2 frases). Lanza error si el proveedor falla. */
  summarize(title: string, text: string): Promise<SummaryResult>;
  /** Llamada genérica (sistema + usuario) para otras tareas de IA. */
  chat(system: string, user: string, opts?: { maxTokens?: number; timeoutMs?: number }): Promise<ChatResult>;
  /** false → el pipeline marca los artículos como 'skipped' sin llamar a nada. */
  isEnabled(): boolean;
}
