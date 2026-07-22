import { CSSProperties, useEffect, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { DdgResult, WikiResult, api } from './api';
import { IcExt, IcSearch, IcX } from './icons';

type Tab = 'ddg' | 'wiki';

/**
 * Sheet de búsqueda con resultados nativos (sin iframes): pestaña Rápida
 * (DuckDuckGo Instant Answers) y Wikipedia (es→en), proxied por el backend.
 * En móvil es deslizable: arrastra arriba para expandir (deja visible el
 * header del artículo), abajo para cerrar. Google abre en el navegador.
 */
export function SearchSheet({ t, phone, query, onClose }: {
  t: Theme;
  phone: boolean;
  query: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('ddg');
  const [ddg, setDdg] = useState<{ loading: boolean; data?: DdgResult; error?: string }>({ loading: true });
  const [wiki, setWiki] = useState<{ loading: boolean; data?: WikiResult; error?: string } | null>(null);
  const q = query.slice(0, 300); // selecciones largas: buscar solo con el inicio

  useEffect(() => {
    api.searchDdg(q)
      .then((data) => setDdg({ loading: false, data }))
      .catch((err) => setDdg({ loading: false, error: (err as Error).message }));
  }, [q]);

  useEffect(() => {
    if (tab !== 'wiki' || wiki) return;
    setWiki({ loading: true });
    api.searchWikipedia(q)
      .then((data) => setWiki({ loading: false, data }))
      .catch((err) => setWiki({ loading: false, error: (err as Error).message }));
  }, [tab, wiki, q]);

  // ── drag del sheet (solo móvil) ────────────────────────────────────────────
  const initialH = Math.round(window.innerHeight * 0.55);
  const maxH = window.innerHeight - 104;
  const [height, setHeight] = useState(initialH);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startH: number } | null>(null);
  const hRef = useRef(initialH);
  const setH = (h: number) => { hRef.current = h; setHeight(h); };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, startH: hRef.current };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sintético */ }
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setH(Math.min(maxH, Math.max(120, drag.current.startH + (drag.current.startY - e.clientY))));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    const h = hRef.current;
    if (h < window.innerHeight * 0.3) onClose();
    else if (h > (initialH + maxH) / 2) setH(maxH);
    else setH(initialH);
  };

  const shadow = t.isDark
    ? '0 4px 18px rgba(49,173,255,0.16), 0 6px 20px rgba(0,0,0,0.55)'
    : '0 2px 6px rgba(15,27,35,0.10), 0 10px 26px rgba(15,27,35,0.18)';

  const sheetStyle: CSSProperties = phone
    ? { position: 'fixed', left: 0, right: 0, bottom: 0, height, zIndex: 72, display: 'flex', flexDirection: 'column', background: t.bg, borderTop: `1.5px solid ${t.activeBar}`, borderRadius: '16px 16px 0 0', boxShadow: shadow, transition: dragging ? 'none' : 'height .22s ease', overflow: 'hidden' }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 72, width: 'min(520px, 92vw)', height: 'min(560px, 82vh)', display: 'flex', flexDirection: 'column', background: t.bg, border: `1.5px solid ${t.activeBar}`, borderRadius: 14, boxShadow: shadow, overflow: 'hidden' };

  const tabBtn = (key: Tab, label: string): CSSProperties => ({
    flex: 1, height: 34, border: 'none', cursor: 'pointer', fontFamily: SN.font.body, fontSize: 13, fontWeight: 600,
    background: tab === key ? t.activeBg : 'transparent',
    color: tab === key ? t.activeText : t.textTertiary,
    borderBottom: tab === key ? `2px solid ${t.activeBar}` : `2px solid transparent`,
  });

  const linkStyle: CSSProperties = { color: t.activeText, textDecoration: 'none', fontWeight: 600 };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 71, background: 'rgba(0,0,0,0.3)' }} />
      <div data-seltool style={sheetStyle}>
        {/* franja superior (arrastrable en móvil) */}
        <div
          {...(phone ? { onPointerDown, onPointerMove, onPointerUp } : {})}
          style={{ flexShrink: 0, padding: phone ? '8px 14px 0' : '12px 14px 0', cursor: phone ? 'grab' : 'default', touchAction: 'none', background: t.surface1 }}>
          {phone && <div style={{ width: 40, height: 4, borderRadius: 4, background: t.border, margin: '0 auto 8px' }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <span style={{ color: t.activeText, display: 'flex', flexShrink: 0 }}><IcSearch s={15} /></span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{query}”</span>
            <button data-seltool onClick={onClose} style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', flexShrink: 0, padding: 4 }}><IcX s={16} /></button>
          </div>
        </div>

        {/* pestañas */}
        <div style={{ flexShrink: 0, display: 'flex', background: t.surface1, borderBottom: `1px solid ${t.borderSubtle}` }}>
          <button data-seltool style={tabBtn('ddg', 'Rápida')} onClick={() => setTab('ddg')}>Rápida</button>
          <button data-seltool style={tabBtn('wiki', 'Wikipedia')} onClick={() => setTab('wiki')}>Wikipedia</button>
        </div>

        {/* contenido */}
        <div className="scroll-y" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px', fontFamily: SN.font.body }}>
          {tab === 'ddg' ? (
            ddg.loading ? <Cargando t={t} /> : ddg.error ? <ErrorMsg t={t} msg={ddg.error} /> : <DdgView t={t} d={ddg.data!} link={linkStyle} />
          ) : (
            !wiki || wiki.loading ? <Cargando t={t} /> : wiki.error ? <ErrorMsg t={t} msg={wiki.error} /> : <WikiView t={t} w={wiki.data!} link={linkStyle} />
          )}
        </div>

        {/* pie: Google en el navegador */}
        <a data-seltool href={`https://www.google.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer"
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px calc(10px + env(safe-area-inset-bottom))', borderTop: `1px solid ${t.borderSubtle}`, background: t.surface1, color: t.textSecondary, fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
          Continuar en Google <IcExt s={12} /> <span style={{ color: t.textMuted, fontWeight: 500 }}>· se abre en el navegador</span>
        </a>
      </div>
    </>
  );
}

function Cargando({ t }: { t: Theme }) {
  return <div style={{ fontSize: 13, color: t.textTertiary, padding: '20px 0', textAlign: 'center' }}>Buscando…</div>;
}

function ErrorMsg({ t, msg }: { t: Theme; msg: string }) {
  return <div style={{ fontSize: 13, color: '#ff5470', padding: '12px 0' }}>{msg}</div>;
}

function DdgView({ t, d, link }: { t: Theme; d: DdgResult; link: CSSProperties }) {
  const empty = !d.answer && !d.abstract && !d.definition && d.related.length === 0;
  if (empty) {
    return <div style={{ fontSize: 13.5, color: t.textTertiary, padding: '12px 0' }}>Sin respuesta rápida para esto — prueba la pestaña Wikipedia o continúa en Google.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {d.answer && (
        <div style={{ background: t.tldrBg, border: `1px solid ${t.tldrBorder}`, borderRadius: SN.radius.base, padding: '10px 12px', fontSize: 14.5, color: t.textPrimary, fontFamily: SN.font.mono }}>{d.answer}</div>
      )}
      {d.abstract && (
        <div>
          {d.heading && <div style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 16, color: t.textPrimary, marginBottom: 6 }}>{d.heading}</div>}
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: t.textSecondary }}>{d.abstract}</div>
          {d.url && <div style={{ marginTop: 6, fontSize: 12.5 }}><a href={d.url} target="_blank" rel="noopener noreferrer" style={link}>{d.source ?? 'Fuente'} ↗</a></div>}
        </div>
      )}
      {d.definition && !d.abstract && (
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: t.textSecondary }}>{d.definition}</div>
      )}
      {d.related.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textTertiary, marginBottom: 6 }}>Relacionado</div>
          {d.related.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', fontSize: 13.5, lineHeight: 1.5, color: t.textSecondary, textDecoration: 'none', padding: '6px 0', borderBottom: `1px solid ${t.borderSubtle}` }}>
              {r.text}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function WikiView({ t, w, link }: { t: Theme; w: WikiResult; link: CSSProperties }) {
  if (!w.found) {
    return <div style={{ fontSize: 13.5, color: t.textTertiary, padding: '12px 0' }}>Wikipedia no tiene artículo para esto — prueba con otra selección o continúa en Google.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 17, color: t.textPrimary, marginBottom: 6 }}>
            {w.title} {w.lang === 'en' && <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 500 }}>(EN)</span>}
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.65, color: t.textSecondary }}>{w.extract || 'Sin resumen disponible.'}</div>
        </div>
        {w.thumbnail && <img src={w.thumbnail} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: SN.radius.base, flexShrink: 0, background: t.surface2 }} />}
      </div>
      <a href={w.url} target="_blank" rel="noopener noreferrer" style={{ ...link, fontSize: 13.5 }}>Ver artículo completo en Wikipedia ↗</a>
      {(w.others?.length ?? 0) > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textTertiary, marginBottom: 6 }}>Otras coincidencias</div>
          {w.others!.map((o) => (
            <a key={o.url} href={o.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', fontSize: 13.5, color: t.textSecondary, textDecoration: 'none', padding: '6px 0', borderBottom: `1px solid ${t.borderSubtle}` }}>
              {o.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
