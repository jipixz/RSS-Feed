import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { SanitizerService } from '../content/sanitizer.service';

export type TtsEngine = 'piper' | 'kokoro';

export interface TtsStatus {
  status: 'none' | 'generating' | 'ready' | 'failed';
  error?: string;
  format?: 'mp3' | 'wav';
}

const MAX_TEXT_CHARS = 30_000;
const KOKORO_TIMEOUT_MS = 600_000; // artículos largos en CPU tardan

/**
 * Audiolibro por artículo con dos motores intercambiables (Strategy):
 *  - piper  → binario local (ligero; puede correr en la propia Pi, sin PC)
 *  - kokoro → servidor HTTP OpenAI-compatible en la PC (mayor calidad)
 * El audio se genera una vez y se cachea en data/audio/.
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly jobs = new Map<string, TtsStatus>();
  private readonly audioDir: string;
  private readonly hasFfmpeg: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sanitizer: SanitizerService,
  ) {
    this.audioDir = resolve(process.cwd(), '..', '..', 'data', 'audio');
    if (!existsSync(this.audioDir)) mkdirSync(this.audioDir, { recursive: true });
    this.hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  }

  private key(id: string, engine: TtsEngine) {
    return `${id}:${engine}`;
  }

  filePath(id: string, engine: TtsEngine, format: 'mp3' | 'wav'): string {
    return join(this.audioDir, `${id}.${engine}.${format}`);
  }

  status(id: string, engine: TtsEngine): TtsStatus {
    const job = this.jobs.get(this.key(id, engine));
    if (job?.status === 'generating' || job?.status === 'failed') return job;
    if (existsSync(this.filePath(id, engine, 'mp3'))) return { status: 'ready', format: 'mp3' };
    if (existsSync(this.filePath(id, engine, 'wav'))) return { status: 'ready', format: 'wav' };
    return { status: 'none' };
  }

  /** Arranca la generación (async). Idempotente: si ya existe o está en curso, no repite. */
  async start(id: string, engine: TtsEngine): Promise<TtsStatus> {
    const current = this.status(id, engine);
    if (current.status === 'ready' || current.status === 'generating') return current;

    const article = await this.prisma.article.findUnique({
      where: { id },
      select: { title: true, fullContent: true, excerpt: true },
    });
    if (!article) throw new NotFoundException('Artículo no encontrado');

    // Texto para narrar: título + cuerpo sin HTML; los bloques de código se omiten
    const body = this.sanitizer
      .toText((article.fullContent || article.excerpt).replace(/<pre[\s\S]*?<\/pre>/gi, '. '))
      .slice(0, MAX_TEXT_CHARS);
    if (!body) throw new BadRequestException('El artículo no tiene texto para narrar');
    const text = `${article.title}. ${body}`;

    this.jobs.set(this.key(id, engine), { status: 'generating' });
    void this.generate(id, engine, text)
      .then((format) => {
        this.jobs.set(this.key(id, engine), { status: 'ready', format });
        this.logger.log(JSON.stringify({ event: 'tts_done', id, engine, format, chars: text.length }));
      })
      .catch((err: Error) => {
        this.jobs.set(this.key(id, engine), { status: 'failed', error: err.message });
        this.logger.warn(`TTS falló (${engine}) para ${id}: ${err.message}`);
      });
    return { status: 'generating' };
  }

  private async generate(id: string, engine: TtsEngine, text: string): Promise<'mp3' | 'wav'> {
    return engine === 'piper' ? this.generatePiper(id, text) : this.generateKokoro(id, text);
  }

  // ── Piper: binario local (Pi o PC), WAV → mp3 si hay ffmpeg ────────────────
  private async generatePiper(id: string, text: string): Promise<'mp3' | 'wav'> {
    const bin = this.config.get<string>('TTS_PIPER_BIN') ?? 'piper';
    const voice = this.config.get<string>('TTS_PIPER_VOICE');
    if (!voice) throw new Error('Configura TTS_PIPER_VOICE (ruta al modelo .onnx) en el .env');

    const wavPath = this.filePath(id, 'piper', 'wav');
    await new Promise<void>((resolvePromise, reject) => {
      const proc = spawn(bin, ['--model', voice, '--output_file', wavPath]);
      let stderr = '';
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('error', (err) => reject(new Error(`No se pudo ejecutar piper (${err.message}) — ¿está instalado?`)));
      proc.on('close', (code) => {
        if (code === 0 && existsSync(wavPath)) resolvePromise();
        else reject(new Error(`piper terminó con código ${code}: ${stderr.slice(-300)}`));
      });
      proc.stdin.write(text);
      proc.stdin.end();
    });

    if (!this.hasFfmpeg) return 'wav';
    // comprimir a mp3 (64k mono) para no mandar 25MB por el tunnel
    const mp3Path = this.filePath(id, 'piper', 'mp3');
    await new Promise<void>((resolvePromise, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', mp3Path]);
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`ffmpeg código ${code}`))));
    });
    unlinkSync(wavPath);
    return 'mp3';
  }

  // ── Kokoro: servidor OpenAI-compatible (/v1/audio/speech) en la PC ─────────
  private async generateKokoro(id: string, text: string): Promise<'mp3'> {
    const baseUrl = (this.config.get<string>('TTS_KOKORO_URL') ?? 'http://localhost:8880').replace(/\/+$/, '');
    const voice = this.config.get<string>('TTS_KOKORO_VOICE') ?? 'af_heart';

    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      signal: AbortSignal.timeout(KOKORO_TIMEOUT_MS),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'kokoro', voice, input: text, response_format: 'mp3' }),
    }).catch((err: Error) => {
      throw new Error(
        err.name === 'TimeoutError'
          ? 'Kokoro tardó demasiado — artículo muy largo o la PC está ocupada'
          : `No se pudo conectar con Kokoro (${err.message}) — ¿está corriendo en la PC?`,
      );
    });
    if (!res.ok) throw new Error(`Kokoro respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length < 1000) throw new Error('Kokoro devolvió un audio vacío');
    await writeFile(this.filePath(id, 'kokoro', 'mp3'), audio);
    return 'mp3';
  }
}
