import { CSSProperties, useEffect, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { ArticleDetail, TtsEngine, TtsStatus, api } from './api';
import { IcHeadphones, IcX } from './icons';

const ENGINE_KEY = 'senal.ttsEngine';
const SPEEDS = [0.9, 1, 1.15, 1.3, 1.5];

/**
 * Audiolibro del artículo: elige motor (Piper rápido / Kokoro calidad),
 * genera una vez (cacheado en el server) y reproduce con MediaSession →
 * controles en la pantalla de bloqueo y reproducción con pantalla apagada.
 */
export function AudioPlayer({ t, article, phone }: { t: Theme; article: ArticleDetail; phone: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [engine, setEngine] = useState<TtsEngine | null>(null);
  const [st, setSt] = useState<TtsStatus | null>(null);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // al cambiar de artículo, resetear
  useEffect(() => {
    setEngine(null);
    setSt(null);
    setMenuOpen(false);
    clearInterval(pollRef.current);
  }, [article.id]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const pick = async (eng: TtsEngine) => {
    setMenuOpen(false);
    setEngine(eng);
    localStorage.setItem(ENGINE_KEY, eng);
    const first = await api.ttsStart(article.id, eng).catch((err) => ({ status: 'failed', error: (err as Error).message }) as TtsStatus);
    setSt(first);
    if (first.status === 'generating') {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const s = await api.ttsStatus(article.id, eng).catch(() => null);
        if (!s) return;
        setSt(s);
        if (s.status !== 'generating') clearInterval(pollRef.current);
      }, 3000);
    }
  };

  // MediaSession: metadata + controles en lockscreen
  const onPlay = () => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: article.title,
      artist: article.source,
      album: 'Señal',
      artwork: article.imageUrl ? [{ src: article.imageUrl, sizes: '512x512' }] : undefined,
    });
    const audio = audioRef.current;
    if (!audio) return;
    navigator.mediaSession.setActionHandler('play', () => void audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
    navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration, audio.currentTime + 30); });
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const iconBtn: CSSProperties = { width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, cursor: 'pointer', flexShrink: 0 };

  const lastEngine = (localStorage.getItem(ENGINE_KEY) as TtsEngine | null) ?? 'piper';

  return (
    <div style={{ position: 'relative' }}>
      <button className="sn-iconbtn" style={{ ...iconBtn, color: engine ? t.activeText : t.textSecondary }} onClick={() => setMenuOpen((v) => !v)} title="Escuchar artículo">
        <IcHeadphones s={16} />
      </button>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 42, right: 0, zIndex: 41, background: t.bg, border: `1px solid ${t.border}`, borderRadius: SN.radius.lg, boxShadow: SN.shadow.lg, padding: 6, width: 230 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textTertiary, padding: '6px 10px' }}>Escuchar con…</div>
            {([
              { eng: 'piper' as TtsEngine, label: '⚡ Rápido (Piper)', desc: 'En la Pi — funciona sin la PC' },
              { eng: 'kokoro' as TtsEngine, label: '✨ Calidad (Kokoro)', desc: 'En la PC — voz más natural' },
            ]).map(({ eng, label, desc }) => (
              <button key={eng} className="sn-hover" onClick={() => void pick(eng)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: lastEngine === eng ? t.activeBg : 'transparent', borderRadius: SN.radius.base, cursor: 'pointer' }}>
                <div style={{ fontFamily: SN.font.body, fontSize: 13.5, fontWeight: 600, color: t.textPrimary }}>{label}</div>
                <div style={{ fontSize: 11.5, color: t.textMuted }}>{desc}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* estado / player */}
      {engine && st && (
        <div style={{ position: 'fixed', left: phone ? 10 : 'auto', right: 10, bottom: phone ? 'calc(12px + env(safe-area-inset-bottom))' : 16, zIndex: 35, width: phone ? 'auto' : 380, background: t.surface1, border: `1.5px solid ${t.activeBar}`, borderRadius: 14, boxShadow: SN.shadow.lg, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: st.status === 'ready' ? 8 : 0 }}>
            <span style={{ color: t.activeText, display: 'flex', flexShrink: 0 }}><IcHeadphones s={15} /></span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.title}</span>
            {st.status === 'ready' && (
              <button onClick={cycleSpeed} style={{ border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, borderRadius: SN.radius.full, padding: '2px 8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: SN.font.mono, flexShrink: 0 }}>{speed}×</button>
            )}
            <button onClick={() => { setEngine(null); setSt(null); clearInterval(pollRef.current); }}
              style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}><IcX s={15} /></button>
          </div>
          {st.status === 'generating' && (
            <div style={{ fontSize: 12, color: t.textTertiary }}>
              Generando audio con {engine === 'piper' ? 'Piper' : 'Kokoro'}… {engine === 'kokoro' ? '(la calidad tarda más)' : ''}
            </div>
          )}
          {st.status === 'failed' && <div style={{ fontSize: 12, color: '#ff5470' }}>{st.error ?? 'Falló la generación'}</div>}
          {st.status === 'ready' && (
            <audio
              ref={audioRef}
              src={`/api/tts/${article.id}/file?engine=${engine}`}
              controls
              onPlay={onPlay}
              style={{ width: '100%', height: 38 }}
            />
          )}
        </div>
      )}
    </div>
  );
}
