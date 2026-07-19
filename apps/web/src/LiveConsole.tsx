import { useEffect, useMemo, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { IcActivity, IcRefresh, IcSpark, IcX } from './icons';
import { api } from './api';

type AiEvent =
  | { type: 'start'; id: string; title: string; source: string; model: string; prompt: string; at: string }
  | { type: 'done'; id: string; title: string; tldr: string; tokens: number | null; ms: number; at: string }
  | { type: 'error'; id: string; title: string; message: string; at: string }
  | { type: 'cycle'; summarized: number; failed: number; budgetLeft: number; at: string }
  | { type: 'ping' };

interface Entry {
  id: string;
  title: string;
  source: string;
  model: string;
  prompt: string;
  status: 'running' | 'done' | 'error';
  tldr: string;
  tokens: number | null;
  ms: number;
  message: string;
}

interface AiInfo {
  provider: string;
  model: string;
  enabled: boolean;
  systemPrompt: string;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour12: false });

/** Consola en vivo: streamea (SSE) cada resumen que genera el proveedor de IA. */
export function LiveConsole({ t, phone, onClose }: { t: Theme; phone: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<AiInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cycle, setCycle] = useState<{ summarized: number; failed: number; budgetLeft: number } | null>(null);
  const [running, setRunning] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const autoScroll = useRef(true);

  useEffect(() => {
    api.aiInfo().then(setInfo).catch(() => undefined);

    const es = new EventSource('/api/ai/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      let ev: AiEvent;
      try {
        ev = JSON.parse(msg.data) as AiEvent;
      } catch {
        return;
      }
      if (ev.type === 'ping') return; // latido — mantiene viva la conexión
      if (ev.type === 'cycle') {
        setCycle({ summarized: ev.summarized, failed: ev.failed, budgetLeft: ev.budgetLeft });
        return;
      }
      setEntries((prev) => {
        if (ev.type === 'start') {
          const entry: Entry = {
            id: ev.id, title: ev.title, source: ev.source, model: ev.model,
            prompt: ev.prompt, status: 'running', tldr: '', tokens: null, ms: 0, message: '',
          };
          // dedupe: si el búfer se re-emite al reconectar, reemplaza en vez de duplicar
          const without = prev.filter((e) => e.id !== ev.id);
          return [entry, ...without].slice(0, 60);
        }
        return prev.map((e) => {
          if (e.id !== ev.id || e.status !== 'running') return e;
          if (ev.type === 'done') return { ...e, status: 'done', tldr: ev.tldr, tokens: ev.tokens, ms: ev.ms };
          if (ev.type === 'error') return { ...e, status: 'error', message: ev.message };
          return e;
        });
      });
    };
    return () => es.close();
  }, []);

  // auto-scroll al tope (lo más nuevo) si el usuario no se movió
  useEffect(() => {
    if (autoScroll.current) feedRef.current?.scrollTo({ top: 0 });
  }, [entries]);

  const generateNow = async () => {
    setRunning(true);
    setCycle(null);
    try {
      await api.ingest();
    } catch {
      /* el proceso corre en el server; los eventos igual llegan */
    } finally {
      setRunning(false);
    }
  };

  const box: React.CSSProperties = {
    background: t.bg, border: `1px solid ${t.border}`, borderRadius: phone ? 0 : 14,
    boxShadow: SN.shadow.lg, width: phone ? '100%' : 'min(680px, 100%)',
    height: phone ? '100%' : '85vh', maxHeight: phone ? '100%' : '85vh', maxWidth: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: phone ? 'stretch' : 'center', padding: phone ? 0 : 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={box}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <span style={{ color: SN.brand.teal, display: 'flex' }}><IcActivity s={18} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <span style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 16, color: t.textPrimary }}>Consola IA en vivo</span>
            <span style={{ fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {info ? `${info.provider} · ${info.model}` : 'conectando…'}
              <span style={{ marginLeft: 8, color: connected ? SN.brand.teal : t.textMuted }}>● {connected ? 'en línea' : 'sin conexión'}</span>
            </span>
          </div>
          <button className="sn-iconbtn" onClick={() => void generateNow()} disabled={running}
            title="Generar ahora"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: phone ? '0 10px' : '0 12px', borderRadius: SN.radius.base, border: 'none', background: SN.brand.blue, color: '#fff', fontFamily: SN.font.body, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: running ? 0.6 : 1 }}>
            <span style={{ display: 'flex', animation: running ? 'sn-spin 1s linear infinite' : undefined }}><IcRefresh s={14} /></span>
            {phone ? (running ? 'Generando…' : 'Generar') : (running ? 'Generando…' : 'Generar ahora')}
          </button>
          <button className="sn-iconbtn" onClick={onClose} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, cursor: 'pointer', flexShrink: 0 }}><IcX s={16} /></button>
        </div>

        {/* prompt de sistema */}
        {info && (
          <details style={{ padding: '10px 16px', borderBottom: `1px solid ${t.borderSubtle}`, flexShrink: 0 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: t.textTertiary, fontWeight: 600 }}>Prompt de sistema (igual para todos)</summary>
            <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', fontFamily: SN.font.mono, fontSize: 12, lineHeight: 1.5, color: t.textSecondary, background: t.surface2, border: `1px solid ${t.borderSubtle}`, borderRadius: SN.radius.base, padding: 10 }}>{info.systemPrompt}</pre>
          </details>
        )}

        {/* cintillo de ciclo */}
        {cycle && (
          <div style={{ padding: '8px 16px', fontSize: 12.5, color: t.textSecondary, background: t.surface1, borderBottom: `1px solid ${t.borderSubtle}`, flexShrink: 0 }}>
            Último ciclo: <b style={{ color: SN.brand.teal }}>{cycle.summarized}</b> resumidos · {cycle.failed} fallidos · {cycle.budgetLeft} de presupuesto restante hoy
          </div>
        )}

        {/* feed */}
        <div ref={feedRef} className="scroll-y"
          onScroll={(e) => { autoScroll.current = e.currentTarget.scrollTop < 24; }}
          style={{ flex: 1, minHeight: 0, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, overflowX: 'hidden' }}>
          {entries.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: t.textTertiary, maxWidth: 320, padding: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: t.surface3, display: 'grid', placeItems: 'center', margin: '0 auto 12px', color: SN.brand.teal }}><IcActivity s={24} /></div>
              <div style={{ fontFamily: SN.font.title, fontWeight: 600, fontSize: 15, color: t.textPrimary, marginBottom: 4 }}>Sin actividad ahora mismo</div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                {info && !info.enabled
                  ? 'El proveedor de IA está desactivado (AI_PROVIDER=none).'
                  : 'Pulsa "Generar ahora" para disparar un ciclo y ver a la IA resumir en tiempo real.'}
              </div>
            </div>
          ) : (
            entries.map((e) => <ConsoleCard key={e.id + e.status} t={t} entry={e} />)
          )}
        </div>
      </div>
    </div>
  );
}

/** Tarjeta de un resumen: título + prompt enviado + TL;DR con efecto máquina de escribir. */
function ConsoleCard({ t, entry }: { t: Theme; entry: Entry }) {
  const typed = useTypewriter(entry.status === 'done' ? entry.tldr : '');
  const accent =
    entry.status === 'error' ? '#ff5470' : entry.status === 'running' ? SN.brand.teal : SN.brand.teal;

  const status =
    entry.status === 'running' ? <span style={{ fontSize: 11, color: SN.brand.teal, whiteSpace: 'nowrap', flexShrink: 0 }}>▍ resumiendo…</span> :
    entry.status === 'done' ? <span style={{ fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>{(entry.ms / 1000).toFixed(1)}s{entry.tokens ? ` · ${entry.tokens} tok` : ''}</span> :
    <span style={{ fontSize: 11, color: '#ff5470', whiteSpace: 'nowrap', flexShrink: 0 }}>error</span>;

  return (
    <div style={{ border: `1px solid ${t.borderSubtle}`, borderLeft: `3px solid ${accent}`, borderRadius: SN.radius.base, background: t.surface1, padding: '10px 12px', minWidth: 0, overflow: 'hidden', flexShrink: 0 }}>
      {/* fuente + estado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, minWidth: 0 }}>
        <span style={{ fontFamily: SN.font.mono, fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{entry.source}</span>
        {status}
      </div>
      {/* título (hasta 2 líneas) */}
      <div style={{ fontFamily: SN.font.title, fontWeight: 600, fontSize: 13.5, lineHeight: 1.35, color: t.textPrimary, marginBottom: 6, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{entry.title}</div>

      {/* prompt enviado — completo, scrolleable si es largo */}
      <details open style={{ marginBottom: entry.status === 'running' && !entry.tldr ? 0 : 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 11, color: t.textMuted, fontFamily: SN.font.mono, marginBottom: 4, listStyle: 'none' }}>
          → prompt enviado ({entry.prompt.length.toLocaleString('es')} car.)
        </summary>
        <div className="scroll-y" style={{ fontFamily: SN.font.mono, fontSize: 11.5, lineHeight: 1.5, color: t.textTertiary, background: t.surface2, borderRadius: 6, padding: '6px 8px', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxHeight: 150, overflowY: 'auto' }}>
          {entry.prompt}
        </div>
      </details>

      {entry.status === 'error' ? (
        <div style={{ fontSize: 12.5, color: '#ff5470', overflowWrap: 'anywhere' }}>✕ {entry.message}</div>
      ) : (entry.status === 'done' || typed) ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', minWidth: 0 }}>
          <span style={{ color: SN.brand.coral, display: 'flex', marginTop: 2, flexShrink: 0 }}><IcSpark s={13} /></span>
          <div style={{ fontFamily: SN.font.body, fontSize: 13.5, lineHeight: 1.55, color: t.textSecondary, minWidth: 0, overflowWrap: 'anywhere' }}>
            {typed}{typed.length < entry.tldr.length && <span style={{ opacity: 0.6 }}>▍</span>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Revela un texto carácter por carácter (efecto de "escribiéndose"). */
function useTypewriter(full: string, cps = 90): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!full) return;
    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const chars = Math.floor(((now - started) / 1000) * cps);
      setN(Math.min(full.length, chars));
      if (chars < full.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [full, cps]);
  return useMemo(() => full.slice(0, n), [full, n]);
}
