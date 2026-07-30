import { CSSProperties, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { TtsEngine, TtsStatus, api } from './api';
import { IcHeadphones, IcList, IcNext, IcPause, IcPlay, IcPrev, IcTrash, IcX } from './icons';

const SPEEDS = [0.9, 1, 1.15, 1.3, 1.5];

const fmt = (s: number) => {
  if (!isFinite(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export interface QueueTrack {
  id: string;
  title: string;
  source: string;
  imageUrl?: string | null;
  engine: TtsEngine;
  voice?: string;
}

export interface AudioQueueHandle {
  /** Reemplaza la cola por [track] y reproduce. */
  playNow: (track: QueueTrack) => void;
  /** Agrega al final (si la cola estaba vacía, empieza a reproducir). */
  enqueue: (track: QueueTrack) => void;
  /** Reemplaza la cola por la lista y reproduce desde el inicio. */
  playAll: (tracks: QueueTrack[]) => void;
}

/**
 * Reproductor de audiolibro a nivel app con COLA: encadena artículos y avanza
 * solo al terminar cada uno (ideal para escuchar caminando sin tocar el
 * teléfono). Genera el audio por artículo (Piper/Kokoro), player flotante al
 * tono del tema, MediaSession con siguiente/anterior en el lockscreen.
 */
export const AudioQueue = forwardRef<AudioQueueHandle, { t: Theme; phone: boolean }>(({ t, phone }, ref) => {
  const [tracks, setTracks] = useState<QueueTrack[]>([]);
  const [idx, setIdx] = useState(0);
  const [st, setSt] = useState<TtsStatus | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const tokenRef = useRef(0); // evita carreras entre cambios de pista

  const current = tracks[idx] ?? null;

  useImperativeHandle(ref, () => ({
    playNow: (track) => { setTracks([track]); setIdx(0); setExpanded(false); },
    enqueue: (track) => setTracks((prev) => (prev.some((x) => x.id === track.id) ? prev : [...prev, track])),
    playAll: (list) => { if (list.length) { setTracks(list); setIdx(0); setExpanded(false); } },
  }), []);

  const stopTimers = () => { clearInterval(pollRef.current); clearInterval(tickRef.current); };

  // Cargar y generar el audio de la pista actual; al quedar lista, reproduce.
  useEffect(() => {
    if (!current) { setSt(null); return; }
    const token = ++tokenRef.current;
    stopTimers();
    setSt(null); setPos(0); setDur(0);
    const { id, engine, voice } = current;

    (async () => {
      const first = await api.ttsStart(id, engine, voice).catch((e) => ({ status: 'failed', error: (e as Error).message }) as TtsStatus);
      if (token !== tokenRef.current) return;
      setSt(first);
      if (first.status === 'generating') {
        const t0 = first.startedAt ? new Date(first.startedAt).getTime() : Date.now();
        setElapsed(Math.max(0, Math.round((Date.now() - t0) / 1000)));
        tickRef.current = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - t0) / 1000))), 1000);
        pollRef.current = setInterval(async () => {
          const s = await api.ttsStatus(id, engine, voice).catch(() => null);
          if (token !== tokenRef.current || !s) return;
          setSt(s);
          if (s.status !== 'generating') stopTimers();
        }, 3000);
      }
    })();

    return stopTimers;
  }, [current?.id, current?.engine, current?.voice]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopTimers(), []);

  const next = useCallback(() => setIdx((i) => Math.min(tracks.length - 1, i + 1)), [tracks.length]);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const hasNext = idx < tracks.length - 1;
  const hasPrev = idx > 0;

  // Manos libres: si una pista falla (p. ej. artículo sin texto narrable) y hay
  // más en la cola, salta sola tras un momento en vez de trabarse.
  useEffect(() => {
    if (st?.status !== 'failed' || !hasNext) return;
    const h = setTimeout(() => next(), 2500);
    return () => clearTimeout(h);
  }, [st?.status, hasNext, next]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play(); else a.pause();
  };

  const onPlay = () => {
    setPlaying(true);
    if (!('mediaSession' in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title, artist: current.source, album: 'Señal',
      artwork: current.imageUrl ? [{ src: current.imageUrl, sizes: '512x512' }] : undefined,
    });
    const a = audioRef.current!;
    navigator.mediaSession.setActionHandler('play', () => void a.play());
    navigator.mediaSession.setActionHandler('pause', () => a.pause());
    navigator.mediaSession.setActionHandler('previoustrack', hasPrev ? () => prev() : null);
    navigator.mediaSession.setActionHandler('nexttrack', hasNext ? () => next() : null);
    navigator.mediaSession.setActionHandler('seekbackward', () => { a.currentTime = Math.max(0, a.currentTime - 10); });
    navigator.mediaSession.setActionHandler('seekforward', () => { a.currentTime = Math.min(a.duration, a.currentTime + 30); });
  };

  const cycleSpeed = () => {
    const nx = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(nx);
    if (audioRef.current) audioRef.current.playbackRate = nx;
  };

  const removeAt = (i: number) => {
    setTracks((prev) => prev.filter((_, k) => k !== i));
    setIdx((cur) => (i < cur ? cur - 1 : Math.min(cur, tracks.length - 2)));
  };
  const close = () => { setTracks([]); setIdx(0); setPlaying(false); setExpanded(false); stopTimers(); };

  if (!current) return null;
  const fileUrl = `/api/tts/${current.id}/file?engine=${current.engine}${current.voice ? `&voice=${encodeURIComponent(current.voice)}` : ''}`;
  const ctrlBtn: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 4 };

  return (
    <div style={{ position: 'fixed', left: phone ? 8 : 'auto', right: phone ? 8 : 16, bottom: phone ? 'calc(10px + env(safe-area-inset-bottom))' : 16, zIndex: 36, width: phone ? 'auto' : 420, background: t.surface1, border: `1.5px solid ${t.activeBar}`, borderRadius: 14, boxShadow: SN.shadow.lg, overflow: 'hidden' }}>
      {/* lista de la cola (expandible) */}
      {expanded && (
        <div className="scroll-y" style={{ maxHeight: 240, overflowY: 'auto', borderBottom: `1px solid ${t.border}`, padding: 6 }}>
          {tracks.map((tr, i) => (
            <div key={tr.id} onClick={() => setIdx(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: SN.radius.base, cursor: 'pointer', background: i === idx ? t.activeBg : 'transparent' }}>
              <span style={{ flexShrink: 0, width: 16, textAlign: 'center', color: i === idx ? t.activeText : t.textMuted }}>{i === idx ? (playing ? '♪' : '‖') : i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: i === idx ? t.textPrimary : t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr.title}</span>
              <button onClick={(e) => { e.stopPropagation(); removeAt(i); }} style={{ ...ctrlBtn, color: t.textMuted }}><IcTrash s={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '9px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: t.activeText, display: 'flex', flexShrink: 0 }}><IcHeadphones s={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.title}</div>
            <div style={{ fontSize: 11, color: t.textMuted }}>{current.source}{tracks.length > 1 ? ` · ${idx + 1}/${tracks.length} en cola` : ''}</div>
          </div>
          {st?.status === 'ready' && (
            <button onClick={cycleSpeed} style={{ border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, borderRadius: SN.radius.full, padding: '2px 8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: SN.font.mono, flexShrink: 0 }}>{speed}×</button>
          )}
          {tracks.length > 1 && (
            <button onClick={() => setExpanded((v) => !v)} title="Ver la cola" style={{ ...ctrlBtn, color: expanded ? t.activeText : t.textMuted }}><IcList s={16} /></button>
          )}
          <button onClick={close} title="Cerrar" style={{ ...ctrlBtn, color: t.textMuted }}><IcX s={15} /></button>
        </div>

        {st?.status === 'generating' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 4, background: t.surface3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '35%', background: t.activeBar, borderRadius: 4, animation: 'sn-slide 1.2s ease-in-out infinite' }} />
            </div>
            <span style={{ fontFamily: SN.font.mono, fontSize: 12, color: t.textTertiary, flexShrink: 0 }}>{fmt(elapsed)}</span>
          </div>
        )}
        {st?.status === 'failed' && (
          <div style={{ fontSize: 12, color: '#ff5470', marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.error ?? 'Falló la generación'}</span>
            {hasNext && <button onClick={next} style={{ ...ctrlBtn, color: t.activeText, fontSize: 12, fontWeight: 700 }}>Saltar →</button>}
          </div>
        )}

        {st?.status === 'ready' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <button onClick={prev} disabled={!hasPrev} style={{ ...ctrlBtn, color: hasPrev ? t.textSecondary : t.textMuted, opacity: hasPrev ? 1 : 0.4 }}><IcPrev s={18} /></button>
              <button onClick={togglePlay} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: SN.brand.blue, color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {playing ? <IcPause s={17} /> : <IcPlay s={17} />}
              </button>
              <button onClick={next} disabled={!hasNext} style={{ ...ctrlBtn, color: hasNext ? t.textSecondary : t.textMuted, opacity: hasNext ? 1 : 0.4 }}><IcNext s={18} /></button>
              <input type="range" min={0} max={dur || 0} step={1} value={pos}
                onChange={(e) => { const a = audioRef.current; if (a) a.currentTime = Number(e.target.value); }}
                style={{ flex: 1, accentColor: t.activeBar, height: 4 }} />
              <span style={{ fontFamily: SN.font.mono, fontSize: 11, color: t.textTertiary, flexShrink: 0 }}>{fmt(pos)} / {fmt(dur)}</span>
            </div>
            <audio
              ref={audioRef}
              src={fileUrl}
              autoPlay
              onPlay={onPlay}
              onPause={() => setPlaying(false)}
              onEnded={() => { if (hasNext) next(); else setPlaying(false); }}
              onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); e.currentTarget.playbackRate = speed; }}
              style={{ display: 'none' }}
            />
          </>
        )}
      </div>
    </div>
  );
});

AudioQueue.displayName = 'AudioQueue';
