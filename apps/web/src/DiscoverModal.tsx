import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { IcCheck, IcPlus, IcSpark, IcX } from './icons';
import { AnalyzeResult, Folder, SuggestedItem, api } from './api';

interface Analysis {
  loading: boolean;
  result?: AnalyzeResult;
  error?: string;
}

export function DiscoverModal({ t, phone, folders, onClose, onChanged }: {
  t: Theme;
  phone: boolean;
  folders: Folder[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<{ folderLabel: string; feeds: SuggestedItem[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, Analysis>>({});
  const folderCache = useRef(new Map<string, string>());

  useEffect(() => {
    folders.forEach((f) => folderCache.current.set(f.label.toLowerCase(), f.key));
    api.suggestedFeeds()
      .then((d) => {
        setGroups(d.groups);
        setAdded(new Set(d.groups.flatMap((g) => g.feeds.filter((f) => f.added).map((f) => f.url))));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [folders]);

  const ensureFolder = async (label: string): Promise<string> => {
    const key = folderCache.current.get(label.toLowerCase());
    if (key) return key;
    const created = await api.createFolder(label);
    folderCache.current.set(label.toLowerCase(), created.key);
    return created.key;
  };

  const addFeed = async (feed: SuggestedItem) => {
    setBusyUrl(feed.url);
    try {
      const folderKey = await ensureFolder(feed.folderLabel);
      await api.createFeed(feed.url, folderKey);
      setAdded((prev) => new Set(prev).add(feed.url));
      onChanged();
    } catch {
      /* si ya existe o falla, no romper la vista */
      setAdded((prev) => new Set(prev).add(feed.url));
    } finally {
      setBusyUrl(null);
    }
  };

  const analyze = async (feed: SuggestedItem) => {
    setAnalysis((prev) => ({ ...prev, [feed.url]: { loading: true } }));
    try {
      const result = await api.analyzeFeed(feed.url);
      setAnalysis((prev) => ({ ...prev, [feed.url]: { loading: false, result } }));
    } catch (err) {
      setAnalysis((prev) => ({ ...prev, [feed.url]: { loading: false, error: (err as Error).message } }));
    }
  };

  const box: CSSProperties = {
    background: t.bg, border: `1px solid ${t.border}`, borderRadius: phone ? 0 : 14, boxShadow: SN.shadow.lg,
    width: phone ? '100%' : 'min(620px, 100%)', maxHeight: phone ? '100%' : '88vh', height: phone ? '100%' : undefined,
    minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 52, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: phone ? 'stretch' : 'center', padding: phone ? 0 : 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 17, color: t.textPrimary }}>Descubrir fuentes</div>
            <div style={{ fontSize: 12.5, color: t.textMuted }}>Sugeridas para tu perfil · la IA opina, tú decides</div>
          </div>
          <button className="sn-iconbtn" onClick={onClose} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, cursor: 'pointer', flexShrink: 0 }}><IcX s={16} /></button>
        </div>

        <div className="scroll-y" style={{ padding: '10px 16px 20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: t.textTertiary, fontSize: 14 }}>Cargando sugerencias…</div>
          ) : (
            groups.map((group) => (
              <div key={group.folderLabel} style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: SN.font.body, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textTertiary, margin: '6px 0 8px' }}>{group.folderLabel}</div>
                {group.feeds.map((feed) => {
                  const isAdded = added.has(feed.url) || feed.added;
                  const a = analysis[feed.url];
                  return (
                    <div key={feed.url} style={{ border: `1px solid ${t.borderSubtle}`, borderRadius: SN.radius.base, background: t.surface1, padding: '10px 12px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: SN.font.title, fontWeight: 600, fontSize: 14, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feed.title}</div>
                          <div style={{ fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feed.note}</div>
                        </div>
                        {isAdded ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: SN.brand.teal, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}><IcCheck s={14} /> Agregada</span>
                        ) : (
                          <button onClick={() => void addFeed(feed)} disabled={busyUrl === feed.url}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px', borderRadius: SN.radius.base, border: 'none', background: SN.brand.blue, color: '#fff', fontFamily: SN.font.body, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: busyUrl === feed.url ? 0.6 : 1 }}>
                            <IcPlus s={14} /> Agregar
                          </button>
                        )}
                      </div>

                      {/* Análisis con IA */}
                      <div style={{ marginTop: 8 }}>
                        {!a ? (
                          <button onClick={() => void analyze(feed)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: SN.radius.full, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, fontFamily: SN.font.body, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <IcSpark s={12} /> Analizar con IA
                          </button>
                        ) : a.loading ? (
                          <div style={{ fontSize: 12.5, color: t.textTertiary }}>Analizando artículos de muestra…</div>
                        ) : a.error ? (
                          <div style={{ fontSize: 12.5, color: '#ff5470' }}>No se pudo analizar: {a.error}</div>
                        ) : a.result ? (
                          <AnalysisView t={t} result={a.result} />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginTop: 4 }}>
            ¿Falta alguna? Agrégala por URL en Ajustes → Agregar fuente.
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisView({ t, result }: { t: Theme; result: AnalyzeResult }) {
  const color = result.score >= 60 ? SN.brand.teal : result.score >= 30 ? SN.brand.coral : t.textMuted;
  return (
    <div style={{ background: t.surface2, borderRadius: SN.radius.base, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: t.textTertiary }}>Afinidad</span>
        <div style={{ flex: 1, height: 6, borderRadius: 6, background: t.surface3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${result.score}%`, background: color }} />
        </div>
        <span style={{ fontFamily: SN.font.mono, fontSize: 12, fontWeight: 600, color }}>{result.score}</span>
      </div>
      {result.verdict ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <span style={{ color: SN.brand.coral, display: 'flex', marginTop: 1, flexShrink: 0 }}><IcSpark s={13} /></span>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: t.textSecondary }}>{result.verdict}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: t.textMuted }}>
          {result.aiEnabled ? 'La IA no dio opinión esta vez.' : 'IA desactivada — solo afinidad por palabras clave.'}
        </div>
      )}
      {result.matched.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {result.matched.slice(0, 8).map((m) => (
            <span key={m} style={{ fontSize: 10.5, color: t.textTertiary, background: t.surface3, borderRadius: SN.radius.full, padding: '1px 7px' }}>{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}
