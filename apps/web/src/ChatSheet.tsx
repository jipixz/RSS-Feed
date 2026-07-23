import { CSSProperties, useEffect, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { ChatTurn, TtsEngine, VoiceOption, api } from './api';
import { IcSend, IcSpark, IcTrash, IcVolume, IcVolumeX, IcX } from './icons';

const STORE_KEY = 'senal.chat'; // sessionStorage: la charla sobrevive al cerrar el panel, no la app
const SPEAK_KEY = 'senal.chatSpeak';
const MODE_KEY = 'senal.chatMode';
// voz propia del chat (no la del audiolibro): aquí se habla español.
// Se guarda como "motor:voz" — kokoro (PC, calidad) o piper (Pi, p. ej. es_MX).
const VOICE_KEY = 'senal.chatVoice';
const DEFAULT_VOICE = 'kokoro:ef_dora';

type Mode = 'chat' | 'tts';

const parseVoice = (v: string): { engine: TtsEngine; id: string } => {
  const [engine, id] = v.includes(':') ? v.split(':', 2) : ['kokoro', v];
  return { engine: engine === 'piper' ? 'piper' : 'kokoro', id };
};

const load = (): ChatTurn[] => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '[]') as ChatTurn[];
  } catch {
    return [];
  }
};

/**
 * Minichat con dos modos:
 *  - Chat: conversa con el modelo (gemma vía Ollama), contexto acotado a 12 turnos.
 *  - Leer: repite literalmente lo que escribas con la voz elegida (TTS puro).
 * Las voces salen de Kokoro; las ef_/em_ hablan español de verdad.
 */
export function ChatSheet({ t, phone, onClose }: { t: Theme; phone: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatTurn[]>(load);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) === 'tts' ? 'tts' : 'chat'));
  const [autoSpeak, setAutoSpeak] = useState(() => localStorage.getItem(SPEAK_KEY) === '1');
  const [voices, setVoices] = useState<{ piper: VoiceOption[]; kokoro: VoiceOption[] }>({ piper: [], kokoro: [] });
  const [voice, setVoice] = useState(() => {
    const v = localStorage.getItem(VOICE_KEY) ?? DEFAULT_VOICE;
    return v.includes(':') ? v : `kokoro:${v}`; // migra el formato viejo sin motor
  });
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    api.ttsVoices().then(setVoices).catch(() => undefined);
    inputRef.current?.focus();
    return () => stopAudio();
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-30)));
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const stopAudio = () => {
    audioRef.current?.pause();
    if (audioRef.current?.src.startsWith('blob:')) URL.revokeObjectURL(audioRef.current.src);
    audioRef.current = null;
  };

  const speak = async (text: string, idx: number) => {
    if (speakingIdx === idx) { stopAudio(); setSpeakingIdx(null); return; }
    stopAudio();
    setSpeakingIdx(idx);
    try {
      const { engine, id } = parseVoice(voice);
      const blob = await api.ttsSay(text.slice(0, 3000), id, engine);
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => { setSpeakingIdx(null); stopAudio(); };
      await audio.play();
    } catch (err) {
      setSpeakingIdx(null);
      setError(`Voz: ${(err as Error).message}`);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput('');
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);

    // modo Leer: no hay modelo — tu texto va directo a Kokoro y se reproduce
    if (mode === 'tts') {
      void speak(text, next.length - 1);
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const { reply } = await api.aiChat(next.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-12));
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      if (autoSpeak) void speak(reply, next.length);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
    inputRef.current?.focus();
  };

  const toggleSpeak = () => {
    const v = !autoSpeak;
    setAutoSpeak(v);
    localStorage.setItem(SPEAK_KEY, v ? '1' : '0');
    if (!v) { stopAudio(); setSpeakingIdx(null); }
  };

  const iconBtn: CSSProperties = { border: 'none', background: 'transparent', color: t.textSecondary, cursor: 'pointer', display: 'flex', padding: 6, borderRadius: SN.radius.base };
  const bubbleBase: CSSProperties = { maxWidth: '82%', padding: '9px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.55, fontFamily: SN.font.body, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: phone ? 'stretch' : 'center', padding: phone ? 0 : 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg, border: phone ? 'none' : `1px solid ${t.border}`, borderRadius: phone ? 0 : SN.radius.xl, boxShadow: SN.shadow.lg, width: phone ? '100%' : 'min(620px, 92vw)', height: phone ? '100%' : 'min(680px, 90vh)', overflow: 'hidden' }}>

        {/* header: en móvil se parte en dos filas para que nada se apachurre */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${t.border}`, background: t.surface1, flexShrink: 0, paddingTop: phone ? 'calc(10px + env(safe-area-inset-top))' : 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: SN.brand.teal, display: 'flex', flexShrink: 0 }}><IcSpark s={17} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 15, color: t.textPrimary }}>Minichat</div>
              {!phone && (
                <div style={{ fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {mode === 'chat' ? 'gemma en tu PC · contexto ligero (12 turnos)' : 'lo que escribas se lee en voz alta'}
                </div>
              )}
            </div>
            {/* pestañas de modo */}
            <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: SN.radius.full, background: t.surface3, flexShrink: 0 }}>
              {([['chat', 'Chat'], ['tts', 'Leer']] as [Mode, string][]).map(([m, label]) => (
                <button key={m} onClick={() => switchMode(m)}
                  style={{ border: 'none', borderRadius: SN.radius.full, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, fontFamily: SN.font.body, cursor: 'pointer', background: mode === m ? t.bg : 'transparent', color: mode === m ? t.activeText : t.textMuted, boxShadow: mode === m ? SN.shadow.sm : 'none' }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={onClose} title="Cerrar" style={{ ...iconBtn, flexShrink: 0 }}><IcX s={16} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={voice} onChange={(e) => { setVoice(e.target.value); localStorage.setItem(VOICE_KEY, e.target.value); }}
              title="Voz"
              style={{ flex: 1, minWidth: 0, maxWidth: phone ? 'none' : 230, height: 30, padding: '0 6px', border: `1px solid ${t.border}`, borderRadius: SN.radius.base, background: t.bg, color: t.textSecondary, fontFamily: SN.font.body, fontSize: 11.5, outline: 'none' }}>
              {voices.kokoro.length === 0 && voices.piper.length === 0 && <option value={voice}>{parseVoice(voice).id}</option>}
              {voices.kokoro.length > 0 && (
                <optgroup label="Kokoro — PC (calidad)">
                  {voices.kokoro.map((v) => <option key={v.id} value={`kokoro:${v.id}`}>{v.label}</option>)}
                </optgroup>
              )}
              {voices.piper.length > 0 && (
                <optgroup label="Piper — Pi (rápido)">
                  {voices.piper.map((v) => <option key={v.id} value={`piper:${v.id}`}>{v.label}</option>)}
                </optgroup>
              )}
            </select>
            {!phone && <span style={{ flex: 1 }} />}
            {mode === 'chat' && (
              <button onClick={toggleSpeak} title={autoSpeak ? 'Leer respuestas: activado' : 'Leer respuestas: apagado'}
                style={{ ...iconBtn, flexShrink: 0, color: autoSpeak ? t.activeText : t.textMuted, background: autoSpeak ? t.activeBg : 'transparent' }}>
                {autoSpeak ? <IcVolume s={16} /> : <IcVolumeX s={16} />}
              </button>
            )}
            <button onClick={() => { setMessages([]); sessionStorage.removeItem(STORE_KEY); }} title="Borrar conversación" style={{ ...iconBtn, flexShrink: 0 }}><IcTrash s={15} /></button>
          </div>
        </div>

        {/* mensajes */}
        <div ref={listRef} className="scroll-y" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: t.textMuted, fontSize: 13, lineHeight: 1.6, maxWidth: 300 }}>
              {mode === 'chat' ? (
                <>Pregúntale lo que sea al modelo — dudas de un artículo, código, o pura curiosidad.
                Activa <IcVolume s={12} /> para que Kokoro lea las respuestas en voz alta.</>
              ) : (
                <>Escribe lo que quieras y lo leo en voz alta con la voz elegida.
                Las voces <b>Dora, Alex y Santa</b> hablan español de verdad.</>
              )}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', flexShrink: 0 }}>
              <div style={{
                ...bubbleBase,
                background: m.role === 'user' ? t.activeBg : t.surface2,
                color: m.role === 'user' ? t.activeText : t.textPrimary,
                border: `1px solid ${m.role === 'user' ? t.activeBar : t.borderSubtle}`,
                borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
              }}>{m.content}</div>
              {(m.role === 'assistant' || mode === 'tts') && (
                <button onClick={() => void speak(m.content, i)} title={speakingIdx === i ? 'Detener' : 'Escuchar'}
                  style={{ ...iconBtn, padding: 4, marginTop: 2, color: speakingIdx === i ? t.activeText : t.textMuted }}>
                  <IcVolume s={13} />{speakingIdx === i && <span style={{ fontSize: 10.5, marginLeft: 3 }}>reproduciendo…</span>}
                </button>
              )}
            </div>
          ))}
          {busy && (
            <div style={{ ...bubbleBase, alignSelf: 'flex-start', background: t.surface2, color: t.textMuted, border: `1px solid ${t.borderSubtle}`, fontStyle: 'italic', flexShrink: 0 }}>
              pensando…
            </div>
          )}
          {error && <div style={{ fontSize: 12.5, color: '#ff5470', flexShrink: 0 }}>{error}</div>}
        </div>

        {/* input */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: 10, borderTop: `1px solid ${t.border}`, background: t.surface1, flexShrink: 0, paddingBottom: phone ? 'calc(10px + env(safe-area-inset-bottom))' : 10 }}>
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            placeholder={mode === 'chat' ? 'Escribe un mensaje…' : 'Escribe y te lo leo en voz alta…'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            style={{ flex: 1, resize: 'none', maxHeight: 110, padding: '9px 12px', border: `1px solid ${t.border}`, borderRadius: SN.radius.lg, background: t.bg, color: t.textPrimary, fontFamily: SN.font.body, fontSize: 14, lineHeight: 1.4, outline: 'none' }}
          />
          <button onClick={() => void send()} disabled={busy || !input.trim()} title="Enviar"
            style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: busy || !input.trim() ? t.surface3 : SN.brand.blue, color: busy || !input.trim() ? t.textMuted : '#fff', cursor: busy || !input.trim() ? 'default' : 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <IcSend s={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
