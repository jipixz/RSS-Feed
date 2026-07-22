import { CSSProperties, useEffect, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { IcExt, IcSearch, IcSpark, IcX } from './icons';
import { api } from './api';

interface Sel { text: string; x: number; y: number }
interface Result { loading: boolean; text?: string; error?: string; source: string }

/**
 * Lectura asistida. En móvil: barra fija abajo (no choca con el menú nativo del
 * navegador) + resultados en bottom sheets. En escritorio: píldora flotante.
 * Traducir usa la IA local; Buscar embebe Bing en un sheet deslizable (Google
 * no permite iframes) con swipe para expandir/cerrar.
 */
export function SelectionTranslator({ t, phone, containerRef }: {
  t: Theme;
  phone: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Detección por selectionchange (más fiable en móvil que mouseup/touchend)
  useEffect(() => {
    const check = () => {
      const s = window.getSelection();
      const text = s?.toString().trim() ?? '';
      if (!s || s.isCollapsed || text.length < 2 || !containerRef.current?.contains(s.anchorNode)) {
        setSel(null);
        return;
      }
      const rect = s.getRangeAt(0).getBoundingClientRect();
      setSel({ text, x: rect.left + rect.width / 2, y: rect.top });
    };
    const onChange = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(check, 220);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      clearTimeout(timer.current);
    };
  }, [containerRef]);

  const translate = () => {
    if (!sel) return;
    const text = sel.text; // capturar antes de que la selección se limpie al tocar
    setResult({ loading: true, source: text });
    void api.translate(text)
      .then(({ translation }) => setResult({ loading: false, text: translation, source: text }))
      .catch((err) => setResult({ loading: false, error: (err as Error).message, source: text }));
  };

  const lookup = () => {
    if (!sel) return;
    if (phone) {
      setSearch(sel.text);   // sheet embebido (Bing)
      setSel(null);
    } else {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(sel.text)}`, '_blank', 'noopener');
      setSel(null);
    }
  };

  const close = () => { setResult(null); setSel(null); };

  if (!sel && !result && !search) return null;

  // Barra al tono del tema: superficie elevada + contorno azul + sombra adaptativa
  const barShadow = t.isDark
    ? `0 4px 18px rgba(49,173,255,0.16), 0 6px 20px rgba(0,0,0,0.55)`
    : `0 2px 6px rgba(15,27,35,0.10), 0 10px 26px rgba(15,27,35,0.18)`;

  const barBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 34, padding: '0 14px', borderRadius: SN.radius.full, border: 'none', background: 'transparent', color: t.textSecondary, fontFamily: SN.font.body, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
  const pillBtn: CSSProperties = { ...barBtn, color: t.bg };

  const trigger = sel && !result && !search && (
    phone ? (
      <div data-seltool style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 70, display: 'flex', alignItems: 'center', gap: 6, background: t.surface3, border: `1.5px solid ${t.activeBar}`, borderRadius: 14, padding: '8px 8px 8px 14px', boxShadow: barShadow }}>
        <span style={{ flex: 1, minWidth: 0, color: t.textSecondary, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{sel.text}”</span>
        <button data-seltool style={{ ...barBtn, background: SN.brand.blue, color: '#fff' }} onClick={translate}><IcSpark s={14} /> Traducir</button>
        <button data-seltool style={{ ...barBtn, width: 40, padding: 0, justifyContent: 'center' }} onClick={lookup} title="Buscar"><IcSearch s={15} /></button>
      </div>
    ) : (
      <div data-seltool style={{ position: 'fixed', top: sel.y < 96 ? sel.y + 26 : sel.y - 48, left: sel.x, transform: 'translateX(-50%)', zIndex: 70, display: 'flex', gap: 2, background: t.textPrimary, borderRadius: SN.radius.full, padding: 3, boxShadow: SN.shadow.lg }}>
        <button data-seltool style={pillBtn} onClick={translate}><IcSpark s={13} /> Traducir</button>
        <span style={{ width: 1, background: t.textMuted, opacity: 0.4, margin: '5px 0' }} />
        <button data-seltool style={pillBtn} onClick={lookup}><IcSearch s={12} /> Google</button>
      </div>
    )
  );

  const resultView = result && (
    <>
      <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 69, background: phone ? 'rgba(0,0,0,0.35)' : 'transparent' }} />
      <div data-seltool style={phone
        ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 70, background: t.bg, borderTop: `1.5px solid ${t.activeBar}`, borderRadius: '16px 16px 0 0', boxShadow: barShadow, padding: '12px 16px calc(20px + env(safe-area-inset-bottom))', maxHeight: '60vh', overflowY: 'auto' }
        : { position: 'fixed', top: Math.min(Math.max(sel ? sel.y - 20 : 80, 60), window.innerHeight - 260), left: '50%', transform: 'translateX(-50%)', zIndex: 70, width: 'min(440px, 92vw)', maxHeight: 320, overflowY: 'auto', background: t.bg, border: `1px solid ${t.border}`, borderRadius: SN.radius.lg, boxShadow: SN.shadow.lg, padding: '12px 14px' }}>
        {phone && <div style={{ width: 40, height: 4, borderRadius: 4, background: t.border, margin: '0 auto 12px' }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: t.tldrText }}>
          <IcSpark s={14} />
          <span style={{ fontFamily: SN.font.body, fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Traducción · IA</span>
          <button data-seltool onClick={close} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex' }}><IcX s={16} /></button>
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>“{result.source}”</div>
        {result.loading ? (
          <div style={{ fontSize: 13, color: t.textTertiary }}>Traduciendo… (la primera del día carga el modelo, ~30 s; luego es rápido)</div>
        ) : result.error ? (
          <div style={{ fontSize: 13, color: '#ff5470' }}>{result.error}</div>
        ) : (
          <div style={{ fontFamily: SN.font.body, fontSize: 15, lineHeight: 1.6, color: t.textPrimary, whiteSpace: 'pre-wrap' }}>{result.text}</div>
        )}
      </div>
    </>
  );

  return (
    <>
      {trigger}
      {resultView}
      {search && <SearchSheet t={t} query={search} shadow={barShadow} onClose={() => setSearch(null)} />}
    </>
  );
}

/**
 * Sheet deslizable con la búsqueda embebida (Bing — Google no permite iframes).
 * Swipe arriba para expandir (deja visible el header del artículo), swipe abajo
 * para cerrar. Arrastre desde la franja superior del sheet.
 */
function SearchSheet({ t, query, shadow, onClose }: { t: Theme; query: string; shadow: string; onClose: () => void }) {
  const initialH = Math.round(window.innerHeight * 0.55);
  const maxH = window.innerHeight - 104; // deja ver el header + un poco del artículo
  const [height, setHeight] = useState(initialH);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startH: number } | null>(null);
  const hRef = useRef(initialH);

  const setH = (h: number) => { hRef.current = h; setHeight(h); };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, startH: hRef.current };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* puntero sintético/edge */ }
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const h = Math.min(maxH, Math.max(120, drag.current.startH + (drag.current.startY - e.clientY)));
    setH(h);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    const h = hRef.current;
    if (h < window.innerHeight * 0.3) onClose();                 // swipe abajo → cerrar
    else if (h > (initialH + maxH) / 2) setH(maxH);              // arriba → expandido
    else setH(initialH);                                          // medio → tamaño inicial
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 71, background: 'rgba(0,0,0,0.25)' }} />
      <div data-seltool style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height, zIndex: 72, display: 'flex', flexDirection: 'column', background: t.bg, borderTop: `1.5px solid ${t.activeBar}`, borderRadius: '16px 16px 0 0', boxShadow: shadow, transition: dragging ? 'none' : 'height .22s ease', overflow: 'hidden' }}>
        {/* franja de arrastre */}
        <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          style={{ flexShrink: 0, padding: '8px 14px 10px', cursor: 'grab', touchAction: 'none', background: t.surface1, borderBottom: `1px solid ${t.borderSubtle}` }}>
          <div style={{ width: 40, height: 4, borderRadius: 4, background: t.border, margin: '0 auto 8px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: t.activeText, display: 'flex', flexShrink: 0 }}><IcSearch s={15} /></span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{query}”</span>
            <a data-seltool href={`https://www.google.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer" title="Abrir en Google"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: t.textSecondary, textDecoration: 'none', flexShrink: 0 }}>
              Google <IcExt s={12} />
            </a>
            <button data-seltool onClick={onClose} style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', flexShrink: 0, padding: 4 }}><IcX s={16} /></button>
          </div>
        </div>
        {/* resultados embebidos */}
        <iframe
          src={`https://www.bing.com/search?q=${encodeURIComponent(query)}`}
          title={`Búsqueda: ${query}`}
          style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
        />
      </div>
    </>
  );
}
