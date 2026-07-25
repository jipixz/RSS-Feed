import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { SanitizerService } from '../content/sanitizer.service';

export type TtsEngine = 'piper' | 'kokoro';

export interface TtsStatus {
  status: 'none' | 'generating' | 'ready' | 'failed';
  error?: string;
  format?: 'mp3' | 'wav';
  startedAt?: string; // para el cronómetro del front
  tookMs?: number; // cuánto tardó la generación
}

export interface VoiceOption {
  id: string;
  label: string;
}

const MAX_TEXT_CHARS = 30_000;
const KOKORO_TIMEOUT_MS = 600_000;
const VOICE_ID_RE = /^[a-zA-Z0-9._-]+$/; // evita path traversal

// Voces de Kokoro (https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
// El prefijo dicta el idioma (ef/em = español) — el server elige el G2P por él.
const KOKORO_VOICES: VoiceOption[] = [
  { id: 'ef_dora', label: 'Dora (mujer, español) ★' },
  { id: 'em_alex', label: 'Alex (hombre, español)' },
  { id: 'em_santa', label: 'Santa (hombre, español)' },
  { id: 'af_heart', label: 'Heart (mujer US) ★' },
  { id: 'af_bella', label: 'Bella (mujer US)' },
  { id: 'af_nicole', label: 'Nicole (mujer US, suave)' },
  { id: 'am_michael', label: 'Michael (hombre US)' },
  { id: 'am_adam', label: 'Adam (hombre US)' },
  { id: 'bf_emma', label: 'Emma (mujer UK)' },
  { id: 'bm_george', label: 'George (hombre UK)' },
];

/**
 * Audiolibro por artículo con dos motores intercambiables (Strategy):
 *  - piper  → binario local (ligero; puede correr en la propia Pi, sin PC)
 *  - kokoro → servidor HTTP OpenAI-compatible en la PC (mayor calidad)
 * El audio se cachea por artículo+motor+voz en data/audio/.
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

  // ── voces disponibles ──────────────────────────────────────────────────────
  private piperVoicesDir(): string | null {
    const envDir = this.config.get<string>('TTS_PIPER_VOICES_DIR');
    if (envDir) return envDir;
    const envVoice = this.config.get<string>('TTS_PIPER_VOICE');
    return envVoice ? dirname(envVoice) : null;
  }

  voices(): { piper: VoiceOption[]; kokoro: VoiceOption[] } {
    const dir = this.piperVoicesDir();
    let piper: VoiceOption[] = [];
    if (dir && existsSync(dir)) {
      piper = readdirSync(dir)
        .filter((f) => f.endsWith('.onnx'))
        .map((f) => {
          const id = basename(f, '.onnx');
          // "en_US-ryan-high" → "Ryan (en US, high)"
          const m = id.match(/^([a-z]{2}_[A-Z]{2})-(.+)-(\w+)$/);
          const label = m ? `${m[2][0].toUpperCase()}${m[2].slice(1)} (${m[1].replace('_', ' ')}, ${m[3]})` : id;
          return { id, label };
        });
    }
    return { piper, kokoro: KOKORO_VOICES };
  }

  private defaultVoice(engine: TtsEngine): string {
    if (engine === 'kokoro') return this.config.get<string>('TTS_KOKORO_VOICE') ?? 'af_heart';
    const envVoice = this.config.get<string>('TTS_PIPER_VOICE');
    return envVoice ? basename(envVoice, '.onnx') : '';
  }

  private resolveVoice(engine: TtsEngine, voice?: string): string {
    const v = voice?.trim() || this.defaultVoice(engine);
    if (!v || !VOICE_ID_RE.test(v)) throw new BadRequestException('Voz inválida');
    return v;
  }

  // ── estado y archivos ──────────────────────────────────────────────────────
  private key(id: string, engine: TtsEngine, voice: string) {
    return `${id}:${engine}:${voice}`;
  }

  filePath(id: string, engine: TtsEngine, voice: string, format: 'mp3' | 'wav'): string {
    return join(this.audioDir, `${id}.${engine}.${voice}.${format}`);
  }

  /** Ruta del archivo resolviendo la voz por default si no se especifica. */
  resolvedPath(id: string, engine: TtsEngine, voiceRaw: string | undefined, format: 'mp3' | 'wav'): string {
    return this.filePath(id, engine, this.resolveVoice(engine, voiceRaw), format);
  }

  status(id: string, engine: TtsEngine, voiceRaw?: string): TtsStatus {
    const voice = this.resolveVoice(engine, voiceRaw);
    const job = this.jobs.get(this.key(id, engine, voice));
    if (job?.status === 'generating' || job?.status === 'failed') return job;
    if (existsSync(this.filePath(id, engine, voice, 'mp3'))) return { status: 'ready', format: 'mp3', tookMs: job?.tookMs };
    if (existsSync(this.filePath(id, engine, voice, 'wav'))) return { status: 'ready', format: 'wav', tookMs: job?.tookMs };
    return { status: 'none' };
  }

  /** Arranca la generación (async). Idempotente por artículo+motor+voz. */
  async start(id: string, engine: TtsEngine, voiceRaw?: string): Promise<TtsStatus> {
    const voice = this.resolveVoice(engine, voiceRaw);
    const current = this.status(id, engine, voice);
    if (current.status === 'ready' || current.status === 'generating') return current;

    const article = await this.prisma.article.findUnique({
      where: { id },
      select: { title: true, fullContent: true, excerpt: true },
    });
    if (!article) throw new NotFoundException('Artículo no encontrado');

    const body = this.sanitizer
      .toSpeech((article.fullContent || article.excerpt).replace(/<pre[\s\S]*?<\/pre>/gi, '. '))
      .slice(0, MAX_TEXT_CHARS);
    if (!body) throw new BadRequestException('El artículo no tiene texto para narrar');
    // título como oración propia + doble salto → el motor hace una pausa clara
    // antes de entrar al cuerpo (se entiende que fue el título)
    const text = `${article.title}.\n\n${body}`;

    const startedAt = new Date();
    const key = this.key(id, engine, voice);
    this.jobs.set(key, { status: 'generating', startedAt: startedAt.toISOString() });
    void this.generate(id, engine, voice, text)
      .then((format) => {
        const tookMs = Date.now() - startedAt.getTime();
        this.jobs.set(key, { status: 'ready', format, tookMs });
        this.logger.log(JSON.stringify({ event: 'tts_done', id, engine, voice, format, tookMs, chars: text.length }));
      })
      .catch((err: Error) => {
        this.jobs.set(key, { status: 'failed', error: err.message });
        this.logger.warn(`TTS falló (${engine}/${voice}) para ${id}: ${err.message}`);
      });
    return { status: 'generating', startedAt: startedAt.toISOString() };
  }

  private async generate(id: string, engine: TtsEngine, voice: string, text: string): Promise<'mp3' | 'wav'> {
    return engine === 'piper' ? this.generatePiper(id, voice, text) : this.generateKokoro(id, voice, text);
  }

  // ── Piper: binario local, WAV → mp3 si hay ffmpeg ──────────────────────────
  private async generatePiper(id: string, voice: string, text: string): Promise<'mp3' | 'wav'> {
    const bin = this.config.get<string>('TTS_PIPER_BIN') ?? 'piper';
    const dir = this.piperVoicesDir();
    if (!dir) throw new Error('Configura TTS_PIPER_VOICE o TTS_PIPER_VOICES_DIR en el .env');
    const modelPath = join(dir, `${voice}.onnx`);
    if (!existsSync(modelPath)) throw new Error(`No existe la voz ${voice}.onnx en ${dir}`);

    const wavPath = this.filePath(id, 'piper', voice, 'wav');
    await new Promise<void>((resolvePromise, reject) => {
      const proc = spawn(bin, ['--model', modelPath, '--output_file', wavPath]);
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
    const mp3Path = this.filePath(id, 'piper', voice, 'mp3');
    await new Promise<void>((resolvePromise, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', mp3Path]);
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`ffmpeg código ${code}`))));
    });
    unlinkSync(wavPath);
    return 'mp3';
  }

  // ── Kokoro: servidor OpenAI-compatible en la PC ────────────────────────────
  private async kokoroSynth(text: string, voice: string, timeoutMs = KOKORO_TIMEOUT_MS): Promise<Buffer> {
    const baseUrl = (this.config.get<string>('TTS_KOKORO_URL') ?? 'http://localhost:8880').replace(/\/+$/, '');

    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'kokoro', voice, input: text, response_format: 'mp3' }),
    }).catch((err: Error) => {
      throw new Error(
        err.name === 'TimeoutError'
          ? 'Kokoro tardó demasiado — texto muy largo o la PC está ocupada'
          : `No se pudo conectar con Kokoro (${err.message}) — ¿está corriendo en la PC?`,
      );
    });
    if (!res.ok) throw new Error(`Kokoro respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length < 1000) throw new Error('Kokoro devolvió un audio vacío');
    return audio;
  }

  private async generateKokoro(id: string, voice: string, text: string): Promise<'mp3'> {
    const audio = await this.kokoroSynth(text, voice);
    await writeFile(this.filePath(id, 'kokoro', voice, 'mp3'), audio);
    return 'mp3';
  }

  /** TTS al vuelo (minichat): sintetiza y devuelve el audio sin cachear. */
  async say(text: string, voiceRaw?: string, engine: TtsEngine = 'kokoro'): Promise<{ audio: Buffer; format: 'mp3' | 'wav' }> {
    const voice = this.resolveVoice(engine, voiceRaw);
    if (engine === 'kokoro') {
      // timeout corto: son textos breves; si Kokoro está frío, la 1ª tarda unos s más
      return { audio: await this.kokoroSynth(text, voice, 90_000), format: 'mp3' };
    }
    // piper: genera a archivo temporal, se lee y se borra
    const tmpId = `say-${randomUUID()}`;
    const format = await this.generatePiper(tmpId, voice, text);
    const path = this.filePath(tmpId, 'piper', voice, format);
    const audio = await readFile(path);
    unlinkSync(path);
    return { audio, format };
  }
}
