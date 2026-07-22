import { CSSProperties, useEffect, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { IcSearch, IcSpark, IcX } from './icons';
import { api } from './api';

interface Sel { text: string; x: number; y: number }
interface Result { loading: boolean; text?: string; error?: string; source: string }

/**
 * Lectura asistida. En móvil: barra fija abajo (para no chocar con el menú
 * nativo del navegador que sale sobre la selección). En escritorio: píldora
 * flotante anclada a la selección. Traduce con IA bajo demanda o busca en Google.
 */
export function SelectionTranslator({ t, phone, containerRef }: {
  t: Theme;
  phone: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [result, setResult] = useState<Result | null>(null);
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

  const google = () => {
    if (sel) window.open(`https://www.google.com/search?q=${encodeURIComponent(sel.text)}`, '_blank', 'noopener');
    setSel(null);
  };

  const close = () => { setResult(null); setSel(null); };

  if (!sel && !result) return null;

  // Barra al tono del tema: superficie elevada + contorno azul + sombra adaptativa
  const barShadow = t.isDark
    ? `0 4px 18px rgba(49,173,255,0.16), 0 6px 20px rgba(0,0,0,0.55)`
    : `0 2px 6px rgba(15,27,35,0.10), 0 10px 26px rgba(15,27,35,0.18)`;

  const barBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 34, padding: '0 14px', borderRadius: SN.radius.full, border: 'none', background: 'transparent', color: t.textSecondary, fontFamily: SN.font.body, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
  const pillBtn: CSSProperties = { ...barBtn, color: t.bg };

  // ── el disparador (barra abajo en móvil / píldora flotante en escritorio) ──
  const trigger = sel && !result && (
    phone ? (
      <div data-seltool style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 70, display: 'flex', alignItems: 'center', gap: 6, background: t.surface3, border: `1.5px solid ${t.activeBar}`, borderRadius: 14, padding: '8px 8px 8px 14px', boxShadow: barShadow }}>
        <span style={{ flex: 1, minWidth: 0, color: t.textSecondary, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{sel.text}”</span>
        <button data-seltool style={{ ...barBtn, background: SN.brand.blue, color: '#fff' }} onClick={translate}><IcSpark s={14} /> Traducir</button>
        <button data-seltool style={{ ...barBtn, width: 40, padding: 0, justifyContent: 'center' }} onClick={google} title="Buscar en Google"><IcSearch s={15} /></button>
      </div>
    ) : (
      <div data-seltool style={{ position: 'fixed', top: sel.y < 96 ? sel.y + 26 : sel.y - 48, left: sel.x, transform: 'translateX(-50%)', zIndex: 70, display: 'flex', gap: 2, background: t.textPrimary, borderRadius: SN.radius.full, padding: 3, boxShadow: SN.shadow.lg }}>
        <button data-seltool style={pillBtn} onClick={translate}><IcSpark s={13} /> Traducir</button>
        <span style={{ width: 1, background: t.textMuted, opacity: 0.4, margin: '5px 0' }} />
        <button data-seltool style={pillBtn} onClick={google}><IcSearch s={12} /> Google</button>
      </div>
    )
  );

  // ── el resultado (bottom sheet en móvil / card centrada en escritorio) ──
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

  return <>{trigger}{resultView}</>;
}
