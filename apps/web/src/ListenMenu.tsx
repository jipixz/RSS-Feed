import { CSSProperties, useState } from 'react';
import { SN, Theme } from './tokens';
import { TtsEngine, VoiceOption, api } from './api';
import { IcHeadphones, IcPlay, IcPlusCircle } from './icons';
import { QueueTrack } from './AudioQueue';

const ENGINE_KEY = 'senal.ttsEngine';
const VOICE_KEY = 'senal.ttsVoice.'; // + engine

export interface ArticleLike {
  id: string;
  title: string;
  source: string;
  imageUrl?: string | null;
}

/** Motor+voz recordados (para "Reproducir Hoy" sin abrir el menú). */
export function defaultEngineVoice(): { engine: TtsEngine; voice?: string } {
  const engine = (localStorage.getItem(ENGINE_KEY) as TtsEngine | null) ?? 'kokoro';
  return { engine, voice: localStorage.getItem(VOICE_KEY + engine) ?? undefined };
}

/**
 * Botón 🎧 con menú de motor/voz. En vez de reproducir él mismo, alimenta la
 * cola global: "Reproducir" arranca ya, "＋" lo agrega al final.
 */
export function ListenMenu({ t, phone, article, onPlay, onEnqueue }: {
  t: Theme;
  phone: boolean;
  article: ArticleLike;
  onPlay: (track: QueueTrack) => void;
  onEnqueue: (track: QueueTrack) => void;
}) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<{ piper: VoiceOption[]; kokoro: VoiceOption[] } | null>(null);
  const [added, setAdded] = useState(false);

  const toggle = () => {
    setOpen((v) => !v);
    if (!voices) api.ttsVoices().then(setVoices).catch(() => setVoices({ piper: [], kokoro: [] }));
  };

  const savedVoice = (eng: TtsEngine) => localStorage.getItem(VOICE_KEY + eng) ?? undefined;
  const track = (engine: TtsEngine, voice?: string): QueueTrack => ({ id: article.id, title: article.title, source: article.source, imageUrl: article.imageUrl, engine, voice });

  const iconBtn: CSSProperties = { width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, cursor: 'pointer', flexShrink: 0 };
  const selStyle: CSSProperties = { flex: 1, minWidth: 0, height: 32, padding: '0 8px', border: `1px solid ${t.border}`, borderRadius: SN.radius.base, background: t.surface1, color: t.textPrimary, fontFamily: SN.font.body, fontSize: 12.5, outline: 'none' };
  const actBtn = (primary: boolean): CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${primary ? SN.brand.blue : t.border}`, background: primary ? SN.brand.blue : t.bg, color: primary ? '#fff' : t.textSecondary, borderRadius: SN.radius.base, padding: '5px 9px', fontSize: 11.5, fontWeight: 700, fontFamily: SN.font.body, cursor: 'pointer' });

  return (
    <div style={{ position: 'relative' }}>
      <button className="sn-iconbtn" style={iconBtn} onClick={toggle} title="Escuchar artículo"><IcHeadphones s={16} /></button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 42, right: phone ? -60 : 0, zIndex: 41, background: t.bg, border: `1px solid ${t.border}`, borderRadius: SN.radius.lg, boxShadow: SN.shadow.lg, padding: 10, width: 260 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textTertiary, marginBottom: 8 }}>Escuchar con…</div>
            {([
              { eng: 'kokoro' as TtsEngine, label: '✨ Calidad (Kokoro)', desc: 'En la PC — voz más natural', list: voices?.kokoro ?? [] },
              { eng: 'piper' as TtsEngine, label: '⚡ Rápido (Piper)', desc: 'En la Pi — sin depender de la PC', list: voices?.piper ?? [] },
            ]).map(({ eng, label, desc, list }) => {
              const chosen = savedVoice(eng) ?? list[0]?.id;
              const commit = (fn: (track: QueueTrack) => void) => {
                localStorage.setItem(ENGINE_KEY, eng);
                if (chosen) localStorage.setItem(VOICE_KEY + eng, chosen);
                fn(track(eng, chosen));
              };
              return (
                <div key={eng} style={{ marginBottom: 10, padding: '8px 10px', borderRadius: SN.radius.base, background: t.surface1, border: `1px solid ${t.borderSubtle}` }}>
                  <div style={{ fontFamily: SN.font.body, fontSize: 13.5, fontWeight: 700, color: t.textPrimary }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: t.textMuted, marginBottom: 6 }}>{desc}</div>
                  {list.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <select value={chosen} onChange={(e) => { localStorage.setItem(VOICE_KEY + eng, e.target.value); setVoices((vv) => (vv ? { ...vv } : vv)); }} style={selStyle}>
                        {list.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={actBtn(true)} onClick={() => { commit(onPlay); setOpen(false); }}><IcPlay s={12} /> Reproducir</button>
                    <button style={actBtn(false)} onClick={() => { commit(onEnqueue); setAdded(true); setTimeout(() => setAdded(false), 1200); }}><IcPlusCircle s={13} /> Cola</button>
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 10.5, color: t.textMuted, lineHeight: 1.4 }}>{added ? '✓ Agregado a la cola' : 'La voz se recuerda por motor.'}</div>
          </div>
        </>
      )}
    </div>
  );
}
