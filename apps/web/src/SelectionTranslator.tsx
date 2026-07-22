import { CSSProperties, useEffect, useState } from 'react';
import { SN, Theme } from './tokens';
import { IcSearch, IcSpark, IcX } from './icons';
import { api } from './api';

interface Sel { text: string; x: number; y: number }
interface Result { loading: boolean; text?: string; error?: string }

/**
 * Lectura asistida: al seleccionar texto dentro del artículo aparece una píldora
 * flotante para traducir con IA (bajo demanda) o buscar en Google. El original se
 * queda en el artículo → traducción bilingüe de facto.
 */
export function SelectionTranslator({ t, containerRef }: {
  t: Theme;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Detectar selección al soltar el mouse/dedo
  useEffect(() => {
    const pick = (e: Event) => {
      // No cerrar si tocaron nuestra propia UI
      if ((e.target as HTMLElement)?.closest?.('[data-seltool]')) return;
      const s = window.getSelection();
      const text = s?.toString().trim() ?? '';
      if (!s || s.isCollapsed || text.length < 2 || !containerRef.current?.contains(s.anchorNode)) {
        setSel(null);
        setResult(null);
        return;
      }
      const rect = s.getRangeAt(0).getBoundingClientRect();
      setSel({ text, x: rect.left + rect.width / 2, y: rect.top });
      setResult(null);
    };
    document.addEventListener('mouseup', pick);
    document.addEventListener('touchend', pick);
    return () => {
      document.removeEventListener('mouseup', pick);
      document.removeEventListener('touchend', pick);
    };
  }, [containerRef]);

  // Cerrar al scrollear el artículo (la selección se desalinea)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !sel) return;
    const close = () => { setSel(null); setResult(null); };
    el.addEventListener('scroll', close, { passive: true });
    return () => el.removeEventListener('scroll', close);
  }, [sel, containerRef]);

  const translate = async () => {
    if (!sel) return;
    setResult({ loading: true });
    try {
      const { translation } = await api.translate(sel.text);
      setResult({ loading: false, text: translation });
    } catch (err) {
      setResult({ loading: false, error: (err as Error).message });
    }
  };

  const google = () => {
    if (sel) window.open(`https://www.google.com/search?q=${encodeURIComponent(sel.text)}`, '_blank', 'noopener');
    setSel(null);
  };

  if (!sel) return null;

  const nearTop = sel.y < 96;
  const pillTop = nearTop ? sel.y + 26 : sel.y - 46;
  const pillBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: SN.radius.full, border: 'none', background: 'transparent', color: t.bg, fontFamily: SN.font.body, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };

  return (
    <>
      {/* píldora de acciones */}
      {!result && (
        <div data-seltool style={{ position: 'fixed', top: pillTop, left: sel.x, transform: 'translateX(-50%)', zIndex: 70, display: 'flex', gap: 2, background: t.textPrimary, borderRadius: SN.radius.full, padding: 3, boxShadow: SN.shadow.lg }}>
          <button data-seltool style={pillBtn} onClick={translate}><IcSpark s={13} /> Traducir</button>
          <span style={{ width: 1, background: t.textMuted, opacity: 0.4, margin: '4px 0' }} />
          <button data-seltool style={pillBtn} onClick={google}><IcSearch s={12} /> Google</button>
        </div>
      )}

      {/* popup con la traducción */}
      {result && (
        <>
          <div onClick={() => { setSel(null); setResult(null); }} style={{ position: 'fixed', inset: 0, zIndex: 69 }} />
          <div data-seltool style={{ position: 'fixed', top: Math.min(Math.max(pillTop, 60), window.innerHeight - 240), left: '50%', transform: 'translateX(-50%)', zIndex: 70, width: 'min(440px, 92vw)', maxHeight: 300, overflowY: 'auto', background: t.bg, border: `1px solid ${t.border}`, borderRadius: SN.radius.lg, boxShadow: SN.shadow.lg, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: t.tldrText }}>
              <IcSpark s={14} />
              <span style={{ fontFamily: SN.font.body, fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Traducción · IA</span>
              <button data-seltool onClick={() => { setSel(null); setResult(null); }} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex' }}><IcX s={15} /></button>
            </div>
            {result.loading ? (
              <div style={{ fontSize: 13, color: t.textTertiary }}>Traduciendo… (la primera del día carga el modelo, ~30 s; luego es rápido)</div>
            ) : result.error ? (
              <div style={{ fontSize: 13, color: '#ff5470' }}>{result.error}</div>
            ) : (
              <div style={{ fontFamily: SN.font.body, fontSize: 14.5, lineHeight: 1.6, color: t.textPrimary, whiteSpace: 'pre-wrap' }}>{result.text}</div>
            )}
          </div>
        </>
      )}
    </>
  );
}
