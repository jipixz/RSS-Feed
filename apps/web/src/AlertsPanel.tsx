import { CSSProperties, useState } from 'react';
import { SN, Theme } from './tokens';
import { HealthAlert, api } from './api';
import { IcAlert, IcBell, IcRefresh, IcTrash, IcX } from './icons';

const DISMISS_KEY = 'senal.dismissedAlerts';

/** Huellas de avisos ignorados (por dispositivo). */
export function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    // guardar solo las últimas 200 huellas para no crecer sin límite
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...set].slice(-200)));
  } catch {
    /* sin almacenamiento: el aviso volverá a salir, no pasa nada */
  }
}

/** Avisos visibles = los críticos + los que no se han ignorado en su escalón actual. */
export function visibleAlerts(alerts: HealthAlert[], dismissed: Set<string>): HealthAlert[] {
  return alerts.filter((a) => !a.dismissible || !dismissed.has(a.fingerprint));
}

/**
 * Centro de avisos: fuentes que llevan mucho fallando e ingesta parada. Lo que
 * antes solo se veía en `pm2 logs`, ahora aparece en la app.
 */
export function AlertsPanel({ t, phone, alerts, dismissed, onDismissedChange, onChanged, onClose }: {
  t: Theme;
  phone: boolean;
  alerts: HealthAlert[];
  dismissed: Set<string>;
  onDismissedChange: (next: Set<string>) => void;
  /** Tras quitar una fuente o forzar ingesta: recargar avisos/fuentes. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const shown = visibleAlerts(alerts, dismissed);
  const hiddenCount = alerts.length - shown.length;

  const dismiss = (a: HealthAlert) => {
    const next = new Set(dismissed);
    next.add(a.fingerprint);
    saveDismissed(next);
    onDismissedChange(next);
  };

  const restoreAll = () => {
    const next = new Set<string>();
    saveDismissed(next);
    onDismissedChange(next);
  };

  const removeFeed = async (a: HealthAlert) => {
    if (!a.feedId) return;
    setBusy(a.id);
    try {
      await api.deleteFeed(a.feedId);
      setNote('Fuente quitada.');
      onChanged();
    } catch (err) {
      setNote(`No se pudo quitar: ${(err as Error).message}`);
    } finally {
      setBusy(null);
      setConfirmId(null);
    }
  };

  const runIngest = async () => {
    setBusy('ingest');
    setNote('Buscando artículos… puede tardar un par de minutos.');
    try {
      const r = await api.ingest();
      setNote(`Listo: ${r.newArticles} artículos nuevos de ${r.feedsFetched} fuentes.`);
      onChanged();
    } catch (err) {
      setNote(`La ingesta falló: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const btn = (kind: 'primary' | 'ghost' | 'danger'): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: SN.radius.base,
    fontFamily: SN.font.body, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${kind === 'primary' ? SN.brand.blue : kind === 'danger' ? '#ff5470' : t.border}`,
    background: kind === 'primary' ? SN.brand.blue : 'transparent',
    color: kind === 'primary' ? '#fff' : kind === 'danger' ? '#ff5470' : t.textSecondary,
  });
  const code: CSSProperties = { fontFamily: SN.font.mono, fontSize: 12, background: t.surface3, color: t.textPrimary, padding: '1px 6px', borderRadius: 4 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: phone ? 'stretch' : 'center', padding: phone ? 0 : 20, fontFamily: SN.font.body }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg, border: phone ? 'none' : `1px solid ${t.border}`, borderRadius: phone ? 0 : SN.radius.xl, boxShadow: SN.shadow.lg, width: phone ? '100%' : 'min(560px, 92vw)', height: phone ? '100%' : 'auto', maxHeight: phone ? '100%' : '85vh', overflow: 'hidden' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', paddingTop: phone ? 'calc(12px + env(safe-area-inset-top))' : 12, borderBottom: `1px solid ${t.border}`, background: t.surface1, flexShrink: 0 }}>
          <span style={{ color: t.textSecondary, display: 'flex' }}><IcBell s={17} /></span>
          <span style={{ flex: 1, fontFamily: SN.font.title, fontWeight: 700, fontSize: 16, color: t.textPrimary }}>Avisos</span>
          <button onClick={onClose} title="Cerrar" style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', padding: 4 }}><IcX s={17} /></button>
        </div>

        <div className="scroll-y" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.length === 0 && (
            <div style={{ padding: '28px 12px', textAlign: 'center', color: t.textTertiary, fontSize: 13.5 }}>
              Todo en orden: la ingesta corre y ninguna fuente lleva tiempo fallando.
            </div>
          )}

          {shown.map((a) => {
            const color = a.level === 'error' ? '#ff5470' : '#f59e0b';
            return (
              <div key={a.id} style={{ border: `1px solid ${t.borderSubtle}`, borderLeft: `3px solid ${color}`, borderRadius: SN.radius.base, background: t.surface1, padding: '11px 12px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color, display: 'flex', flexShrink: 0, paddingTop: 1 }}><IcAlert s={16} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: t.textPrimary, lineHeight: 1.35 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, lineHeight: 1.45, wordBreak: 'break-word' }}>
                      {a.detail}
                      {a.since && (
                        <div style={{ marginTop: 2 }}>
                          Último ciclo completo: {new Date(a.since).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                        </div>
                      )}
                    </div>

                    {a.kind === 'ingest_stale' && (
                      <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 8, lineHeight: 1.7 }}>
                        Si no se recupera sola, en la Pi: <span style={code}>pm2 logs senal</span> para ver el error y <span style={code}>pm2 restart senal</span> para reiniciarla.
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {a.kind === 'ingest_stale' && (
                        <button style={btn('primary')} disabled={busy === 'ingest'} onClick={() => void runIngest()}>
                          <span style={{ display: 'flex', animation: busy === 'ingest' ? 'sn-spin 1s linear infinite' : undefined }}><IcRefresh s={13} /></span>
                          Buscar artículos ahora
                        </button>
                      )}
                      {a.kind === 'feed_failing' && (confirmId === a.id ? (
                        <>
                          <button style={btn('danger')} disabled={busy === a.id} onClick={() => void removeFeed(a)}><IcTrash s={13} /> Sí, quitarla</button>
                          <button style={btn('ghost')} onClick={() => setConfirmId(null)}>Cancelar</button>
                        </>
                      ) : (
                        <button style={btn('ghost')} onClick={() => setConfirmId(a.id)}><IcTrash s={13} /> Quitar fuente</button>
                      ))}
                      {a.dismissible && confirmId !== a.id && (
                        <button style={btn('ghost')} onClick={() => dismiss(a)} title="Vuelve a avisar si empeora">Ignorar</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {note && <div style={{ fontSize: 12.5, color: t.textSecondary }}>{note}</div>}

          {hiddenCount > 0 && (
            <button onClick={restoreAll} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: t.activeText, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
              Mostrar {hiddenCount} {hiddenCount === 1 ? 'aviso ignorado' : 'avisos ignorados'}
            </button>
          )}

          <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5, marginTop: 4 }}>
            Ignorar silencia un aviso hasta que empeore (una fuente vuelve a avisar al día y a la semana de fallar).
            Los avisos de ingesta parada no se pueden ignorar: desaparecen solos al recuperarse.
          </div>
        </div>
      </div>
    </div>
  );
}
