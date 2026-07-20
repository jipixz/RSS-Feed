import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { SN, Theme } from './tokens';
import { IcCode, IcCpu, IcDb, IcDownload, IcPlus, IcShield, IcSpark, IcTag, IcTrash, IcUpload, IcX } from './icons';
import { api, FeedInfo, Folder } from './api';
import { GesturePrefs, SwipeAction } from './local-prefs';

const FOLDER_ICONS: Record<string, (p: { s?: number }) => React.ReactElement> = {
  ai: IcCpu, dev: IcCode, sql: IcDb, sec: IcShield,
};
const iconFor = (key: string) => FOLDER_ICONS[key] ?? IcTag;

const SWIPE_OPTIONS: { value: SwipeAction; label: string }[] = [
  { value: 'read', label: 'Marcar leído / no leído' },
  { value: 'star', label: 'Guardar / quitar' },
  { value: 'none', label: 'Nada' },
];

export function SettingsModal({ t, phone, folders, feeds, gestures, onGestures, canInstall, onInstall, onDiscover, onClose, onChanged }: {
  t: Theme;
  phone: boolean;
  folders: Folder[];
  feeds: FeedInfo[];
  gestures: GesturePrefs;
  onGestures: (g: GesturePrefs) => void;
  canInstall: boolean;
  onInstall: () => void;
  onDiscover: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [url, setUrl] = useState('');
  const [folderKey, setFolderKey] = useState(folders[0]?.key ?? '');
  const [newFolder, setNewFolder] = useState(false);
  const [newFolderLabel, setNewFolderLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.getPrefs().then((p) => setInterests(p.interests)).catch(() => undefined);
  }, []);

  const note = (msg: string | null, err = false) => {
    setError(err ? msg : null);
    setOkMsg(err ? null : msg);
  };

  const addFeed = async () => {
    note(null);
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    setBusy(true);
    try {
      let key = folderKey;
      if (newFolder) {
        const label = newFolderLabel.trim();
        if (!label) throw new Error('Ponle nombre a la carpeta nueva');
        const created = await api.createFolder(label);
        key = created.key;
      }
      const feed = await api.createFeed(cleanUrl, key);
      note(`Agregado: ${feed.title} — se ingesta en el próximo ciclo (o pulsa Actualizar)`);
      setUrl('');
      setNewFolder(false);
      setNewFolderLabel('');
      setFolderKey(key);
      onChanged();
    } catch (err) {
      note((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const removeFeed = async (feed: FeedInfo) => {
    setBusy(true);
    try {
      await api.deleteFeed(feed.id);
      note(`Eliminado: ${feed.title} (sus artículos guardados se conservan)`);
      onChanged();
    } catch (err) {
      note((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const removeFolder = async (key: string) => {
    try {
      await api.deleteFolder(key);
      onChanged();
    } catch (err) {
      note((err as Error).message, true);
    }
  };

  const saveInterests = async (next: string[]) => {
    setInterests(next);
    await api.setInterests(next).catch(() => undefined);
  };

  const addInterest = () => {
    const term = interestInput.trim();
    setInterestInput('');
    if (term && !interests.includes(term)) void saveInterests([...interests, term]);
  };

  const importOpml = async (file: File) => {
    note(null);
    setBusy(true);
    try {
      const text = await file.text();
      const result = await api.importOpml(text);
      note(`OPML importado: ${result.feeds} fuentes nuevas, ${result.folders} carpetas, ${result.skipped} ya existían`);
      onChanged();
    } catch (err) {
      note((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const input: CSSProperties = { height: 40, padding: '0 12px', border: `1px solid ${t.border}`, borderRadius: SN.radius.base, background: t.surface1, color: t.textPrimary, fontFamily: SN.font.body, fontSize: 14, outline: 'none', minWidth: 0 };
  const primaryBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: SN.radius.base, border: 'none', background: SN.brand.blue, color: '#fff', fontFamily: SN.font.body, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 };
  const ghost: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 12px', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, fontFamily: SN.font.body, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' };
  const sectionTitle: CSSProperties = { margin: '18px 0 8px', fontFamily: SN.font.body, fontWeight: 600, fontSize: 12, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.textTertiary };

  const byFolder = useMemo(() => {
    const map = new Map<string, FeedInfo[]>();
    for (const f of feeds) {
      if (!map.has(f.folderKey)) map.set(f.folderKey, []);
      map.get(f.folderKey)!.push(f);
    }
    return map;
  }, [feeds]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: phone ? 'stretch' : 'center', padding: phone ? 0 : 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: phone ? 0 : 14, boxShadow: SN.shadow.lg, width: phone ? '100%' : 'min(600px, 100%)', maxHeight: phone ? '100%' : '88vh', height: phone ? '100%' : undefined, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <span style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 17, color: t.textPrimary }}>Ajustes</span>
          <button className="sn-iconbtn" onClick={onClose} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, cursor: 'pointer' }}><IcX s={16} /></button>
        </div>

        <div className="scroll-y" style={{ padding: '4px 18px 20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {(error || okMsg) && (
            <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '8px 0', background: t.bg }}>
              <div style={{ color: error ? '#D43F0E' : t.tldrText, fontSize: 13 }}>{error ?? okMsg}</div>
            </div>
          )}

          {/* Instalar como app (PWA) */}
          {canInstall && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginTop: 8, borderRadius: SN.radius.lg, border: `1px solid ${t.activeBar}`, background: t.activeBg }}>
              <span style={{ color: t.activeText, display: 'flex', flexShrink: 0 }}><IcDownload s={20} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 14, color: t.textPrimary }}>Instalar Señal como app</div>
                <div style={{ fontSize: 12.5, color: t.textSecondary }}>Pantalla completa, sin barra del navegador.</div>
              </div>
              <button onClick={onInstall}
                style={{ height: 36, padding: '0 14px', borderRadius: SN.radius.base, border: 'none', background: SN.brand.blue, color: '#fff', fontFamily: SN.font.body, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                Instalar
              </button>
            </div>
          )}

          {/* Descubrir fuentes sugeridas */}
          <button onClick={onDiscover}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', marginTop: 8, borderRadius: SN.radius.lg, border: `1px solid ${t.border}`, background: t.surface1, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ color: SN.brand.coral, display: 'flex', flexShrink: 0 }}><IcSpark s={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 14, color: t.textPrimary }}>Descubrir fuentes</div>
              <div style={{ fontSize: 12.5, color: t.textMuted }}>Sugeridas para tu perfil, con opinión de la IA</div>
            </div>
            <span style={{ color: t.textMuted, fontSize: 18, flexShrink: 0 }}>›</span>
          </button>

          {/* Agregar fuente */}
          <div style={sectionTitle}>Agregar fuente</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="sn-input" style={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ejemplo.com/feed.xml" inputMode="url" />
            <div style={{ display: 'flex', gap: 8 }}>
              {!newFolder ? (
                <select value={folderKey} onChange={(e) => { if (e.target.value === '__new__') setNewFolder(true); else setFolderKey(e.target.value); }}
                  style={{ ...input, flex: 1, appearance: 'auto' }}>
                  {folders.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  <option value="__new__">+ Nueva carpeta…</option>
                </select>
              ) : (
                <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                  <input className="sn-input" style={{ ...input, flex: 1 }} value={newFolderLabel} onChange={(e) => setNewFolderLabel(e.target.value)} placeholder="Nombre del tema (p. ej. Ciencia)" autoFocus />
                  <button className="sn-iconbtn" onClick={() => { setNewFolder(false); setNewFolderLabel(''); }} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, cursor: 'pointer', flexShrink: 0 }}><IcX s={14} /></button>
                </div>
              )}
              <button style={primaryBtn} disabled={busy} onClick={() => void addFeed()}><IcPlus s={15} /> Agregar</button>
            </div>
          </div>

          {/* Intereses para "Hoy" */}
          <div style={sectionTitle}>Intereses (rankean la vista "Hoy")</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {interests.map((term) => (
              <span key={term} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: t.surface2, color: t.textSecondary, border: `1px solid ${t.border}`, borderRadius: SN.radius.full, padding: '3px 6px 3px 10px', fontSize: 12.5, fontWeight: 600 }}>
                {term}
                <span className="sn-chip-x" onClick={() => void saveInterests(interests.filter((x) => x !== term))}><IcX s={12} /></span>
              </span>
            ))}
            <input className="sn-input" value={interestInput} onChange={(e) => setInterestInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addInterest()} placeholder="+ interés"
              style={{ border: `1px dashed ${t.border}`, outline: 'none', background: 'transparent', borderRadius: SN.radius.full, padding: '4px 10px', width: 90, fontFamily: SN.font.body, fontSize: 12.5, color: t.textPrimary }} />
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>Coinciden por texto (título ×3, TL;DR ×2, resto ×1). Mezcla términos en inglés y español — la mayoría de feeds están en inglés.</div>

          {/* Gestos */}
          {phone && (
            <>
              <div style={sectionTitle}>Gestos (deslizar en la lista)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(['right', 'left'] as const).map((dir) => (
                  <div key={dir} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13.5, color: t.textSecondary, width: 130, flexShrink: 0 }}>{dir === 'right' ? 'Deslizar derecha →' : '← Deslizar izquierda'}</span>
                    <select value={gestures[dir]} onChange={(e) => onGestures({ ...gestures, [dir]: e.target.value as SwipeAction })}
                      style={{ ...input, flex: 1, height: 36, appearance: 'auto' }}>
                      {SWIPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* OPML */}
          <div style={sectionTitle}>Respaldo / migración (OPML)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a style={ghost} className="sn-iconbtn" href="/api/opml" download="senal.opml"><IcDownload s={15} /> Exportar OPML</a>
            <button style={ghost} className="sn-iconbtn" disabled={busy} onClick={() => fileRef.current?.click()}><IcUpload s={15} /> Importar OPML</button>
            <input ref={fileRef} type="file" accept=".opml,.xml,text/xml" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importOpml(f); e.target.value = ''; }} />
          </div>

          {/* Fuentes por carpeta */}
          <div style={sectionTitle}>Tus fuentes</div>
          {folders.map((folder) => {
            const list = byFolder.get(folder.key) ?? [];
            const FIcon = iconFor(folder.key);
            return (
              <div key={folder.key} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: t.textTertiary, display: 'flex' }}><FIcon s={15} /></span>
                  <span style={{ fontFamily: SN.font.body, fontWeight: 700, fontSize: 13.5, color: t.textPrimary }}>{folder.label}</span>
                  <span style={{ fontSize: 12, color: t.textMuted }}>{list.length} {list.length === 1 ? 'fuente' : 'fuentes'}</span>
                  {list.length === 0 && (
                    <button onClick={() => void removeFolder(folder.key)} title="Eliminar carpeta vacía"
                      style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', padding: 4 }}><IcTrash s={14} /></button>
                  )}
                </div>
                {list.map((feed) => (
                  <div key={feed.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: SN.radius.base, border: `1px solid ${t.borderSubtle}`, marginBottom: 6, background: t.surface1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feed.title}</div>
                      <div style={{ fontSize: 12, color: feed.lastFetchStatus === 'error' ? '#D43F0E' : t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {feed.lastFetchStatus === 'error' ? `Error: ${feed.lastError ?? 'desconocido'}` : feed.url}
                      </div>
                    </div>
                    <button onClick={() => void removeFeed(feed)} disabled={busy} title="Eliminar fuente"
                      style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', padding: 6, flexShrink: 0 }}>
                      <IcTrash s={15} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
