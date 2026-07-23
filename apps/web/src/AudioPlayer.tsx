import { CSSProperties, useEffect, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { ArticleDetail, TtsEngine, TtsStatus, VoiceOption, api } from './api';
import { IcHeadphones, IcX } from './icons';

const ENGINE_KEY = 'senal.ttsEngine';
const VOICE_KEY = 'senal.ttsVoice.'; // + engine
const SPEEDS = [0.9, 1, 1.15, 1.3, 1.5];

const fmtTime = (s: number) => {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/**
 * Audiolibro: motor (Piper rápido / Kokoro calidad) + voz elegibles, audio
 * cacheado en el server, player custom al tono del tema con MediaSession
 * (controles en lockscreen). Cronómetro visible durante la generación.
 */
export function AudioPlayer({ t, article, phone }: { t: Theme; article: ArticleDetail; phone: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [voices, setVoices] = useState<{ piper: VoiceOption[]; kokoro: VoiceOption[] } | null>(null);
  const [engine, setEngine] = useState<TtsEngine | null>(null);
  const [voice, setVoice] = useState<string | undefined>(undefined);
  const [st, setSt] = useState<TtsStatus | null>(null);
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    setEngine(null); setSt(null); setMenuOpen(false); setPlaying(false); setPos(0); setDur(0);
    clearInterval(pollRef.current); clearInterval(tickRef.current);
  }, [article.id]);

  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(tickRef.current); }, []);

  const openMenu = () => {
    setMenuOpen((v) => !v);
    if (!voices) api.ttsVoices().then(setVoices).catch(() => setVoices({ piper: [], kokoro: [] }));
  };

  const savedVoice = (eng: TtsEngine) => localStorage.getItem(VOICE_KEY + eng) ?? undefined;

  const pick = async (eng: TtsEngine, v?: string) => {
    setMenuOpen(false);
    setEngine(eng);
    setVoice(v);
    localStorage.setItem(ENGINE_KEY, eng);
    if (v) localStorage.setItem(VOICE_KEY + eng, v);

    const first = await api.ttsStart(article.id, eng, v).catch((err) => ({ status: 'failed', error: (err as Error).message }) as TtsStatus);
    setSt(first);
    if (first.status === 'generating') {
      const t0 = first.startedAt ? new Date(first.startedAt).getTime() : Date.now();
      setElapsed(Math.max(0, Math.round((Date.now() - t0) / 1000)));
      clearInterval(tickRef.current);
      tickRef.current = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - t0) / 1000))), 1000);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const s = await api.ttsStatus(article.id, eng, v).catch(() => null);
        if (!s) return;
        setSt(s);
        if (s.status !== 'generating') { clearInterval(pollRef.current); clearInterval(tickRef.current); }
      }, 3000);
    }
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  const onPlay = () => {
    setPlaying(true);
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: article.title,
      artist: article.source,
      album: 'Señal',
      artwork: article.imageUrl ? [{ src: article.imageUrl, sizes: '512x512' }] : undefined,
    });
    const a = audioRef.current;
    if (!a) return;
    navigator.mediaSession.setActionHandler('play', () => void a.play());
    navigator.mediaSession.setActionHandler('pause', () => a.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => { a.currentTime = Math.max(0, a.currentTime - 10); });
    navigator.mediaSession.setActionHandler('seekforward', () => { a.currentTime = Math.min(a.duration, a.currentTime + 30); });
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const iconBtn: CSSProperties = { width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, cursor: 'pointer', flexShrink: 0 };
  const selStyle: CSSProperties = { width: '100%', height: 32, marginTop: 4, padding: '0 8px', border: `1px solid ${t.border}`, borderRadius: SN.radius.base, background: t.surface1, color: t.textPrimary, fontFamily: SN.font.body, fontSize: 12.5, outline: 'none' };

  const lastEngine = (localStorage.getItem(ENGINE_KEY) as TtsEngine | null) ?? 'piper';
  const fileUrl = engine ? `/api/tts/${article.id}/file?engine=${engine}${voice ? `&voice=${encodeURIComponent(voice)}` : ''}` : '';

  return (
    <div style={{ position: 'relative' }}>
      <button className="sn-iconbtn" style={{ ...iconBtn, color: engine ? t.activeText : t.textSecondary }} onClick={openMenu} title="Escuchar artículo">
        <IcHeadphones s={16} />
      </button>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 42, right: phone ? -60 : 0, zIndex: 41, background: t.bg, border: `1px solid ${t.border}`, borderRadius: SN.radius.lg, boxShadow: SN.shadow.lg, padding: 10, width: 250 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textTertiary, marginBottom: 8 }}>Escuchar con…</div>
            {([
              { eng: 'piper' as TtsEngine, label: '⚡ Rápido (Piper)', desc: 'En la Pi — funciona sin la PC', list: voices?.piper ?? [] },
              { eng: 'kokoro' as TtsEngine, label: '✨ Calidad (Kokoro)', desc: 'En la PC — voz más natural', list: voices?.kokoro ?? [] },
            ]).map(({ eng, label, desc, list }) => {
              const chosen = savedVoice(eng) ?? list[0]?.id;
              return (
                <div key={eng} style={{ marginBottom: 10, padding: '8px 10px', borderRadius: SN.radius.base, background: lastEngine === eng ? t.activeBg : t.surface1, border: `1px solid ${lastEngine === eng ? t.activeBar : t.borderSubtle}` }}>
                  <button className="sn-hover" onClick={() => void pick(eng, chosen)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                    <div style={{ fontFamily: SN.font.body, fontSize: 13.5, fontWeight: 700, color: t.textPrimary }}>{label}</div>
                    <div style={{ fontSize: 11.5, color: t.textMuted }}>{desc}</div>
                  </button>
                  {list.length > 0 && (
                    <select value={chosen} onChange={(e) => { localStorage.setItem(VOICE_KEY + eng, e.target.value); setVoices((vv) => vv ? { ...vv } : vv); }} style={selStyle}>
                      {list.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 10.5, color: t.textMuted, lineHeight: 1.4 }}>La voz se recuerda por motor. Toca el nombre del motor para generar.</div>
          </div>
        </>
      )}

      {/* card de estado / player (al tono del tema) */}
      {engine && st && (
        <div style={{ position: 'fixed', left: phone ? 10 : 'auto', right: 10, bottom: phone ? 'calc(12px + env(safe-area-inset-bottom))' : 16, zIndex: 35, width: phone ? 'auto' : 390, background: t.surface1, border: `1.5px solid ${t.activeBar}`, borderRadius: 14, boxShadow: SN.shadow.lg, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: t.activeText, display: 'flex', flexShrink: 0 }}><IcHeadphones s={15} /></span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.title}</span>
            {st.status === 'ready' && (
              <button onClick={cycleSpeed} style={{ border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, borderRadius: SN.radius.full, padding: '2px 8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: SN.font.mono, flexShrink: 0 }}>{speed}×</button>
            )}
            <button onClick={() => { setEngine(null); setSt(null); setPlaying(false); clearInterval(pollRef.current); clearInterval(tickRef.current); }}
              style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}><IcX s={15} /></button>
          </div>

          {st.status === 'generating' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 4, background: t.surface3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '35%', background: t.activeBar, borderRadius: 4, animation: 'sn-slide 1.2s ease-in-out infinite' }} />
              </div>
              <span style={{ fontFamily: SN.font.mono, fontSize: 12, color: t.textTertiary, flexShrink: 0 }}>{fmtTime(elapsed)}</span>
            </div>
          )}
          {st.status === 'generating' && (
            <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 4 }}>
              Generando con {engine === 'piper' ? 'Piper' : 'Kokoro'}{voice ? ` · ${voice}` : ''}…
            </div>
          )}
          {st.status === 'failed' && <div style={{ fontSize: 12, color: '#ff5470', marginTop: 6 }}>{st.error ?? 'Falló la generación'}</div>}

          {st.status === 'ready' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <button onClick={togglePlay}
                  style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: SN.brand.blue, color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 15 }}>
                  {playing ? '❚❚' : '▶'}
                </button>
                <input
                  type="range" min={0} max={dur || 0} step={1} value={pos}
                  onChange={(e) => { const a = audioRef.current; if (a) a.currentTime = Number(e.target.value); }}
                  style={{ flex: 1, accentColor: t.activeBar, height: 4 }}
                />
                <span style={{ fontFamily: SN.font.mono, fontSize: 11.5, color: t.textTertiary, flexShrink: 0 }}>{fmtTime(pos)} / {fmtTime(dur)}</span>
              </div>
              {st.tookMs && <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 4 }}>generado en {fmtTime(st.tookMs / 1000)}</div>}
              <audio
                ref={audioRef}
                src={fileUrl}
                onPlay={onPlay}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); e.currentTarget.playbackRate = speed; }}
                style={{ display: 'none' }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
