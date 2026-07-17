import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { SN, THEMES } from './tokens';
import {
  IcCheck, IcCircle, IcCode, IcCpu, IcDb, IcExt, IcFilter, IcInbox, IcMoon,
  IcRefresh, IcSearch, IcShield, IcSpark, IcStar, IcStarF, IcSun, IcX,
} from './icons';
import { api, ArticleDetail, ArticleListItem, Folder, timeAgo } from './api';

const FOLDERS = [
  { id: 'all', label: 'Todos', Icon: IcInbox },
  { id: 'ai', label: 'IA', Icon: IcCpu },
  { id: 'dev', label: 'Desarrollo', Icon: IcCode },
  { id: 'sql', label: 'SQL Server', Icon: IcDb },
  { id: 'sec', label: 'Seguridad', Icon: IcShield },
] as const;

function Pill({ children, bg, color, mono }: { children: React.ReactNode; bg: string; color: string; mono?: boolean }) {
  return (
    <span style={{ background: bg, color, fontFamily: mono ? SN.font.mono : SN.font.body, fontSize: mono ? 11 : 12, fontWeight: 600, padding: '2px 8px', borderRadius: SN.radius.full, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

export default function App() {
  const [dark, setDark] = useState(false);
  const t = dark ? THEMES.dark : THEMES.light;

  const [folder, setFolder] = useState('all');
  const [saved, setSaved] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [items, setItems] = useState<ArticleListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hiddenByMutes, setHiddenByMutes] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [feedsCount, setFeedsCount] = useState(0);
  const [mutes, setMutes] = useState<string[]>([]);
  const [muteInput, setMuteInput] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── carga inicial: tema, mutes, carpetas, feeds ────────────────────────────
  useEffect(() => {
    api.getPrefs().then((p) => setDark(p.theme === 'dark')).catch(() => undefined);
    api.mutes().then(setMutes).catch(() => undefined);
    api.feedsCount().then(setFeedsCount).catch(() => undefined);
    void refreshFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshFolders = useCallback(async () => {
    try {
      setFolders(await api.folders());
    } catch {
      /* sidebar sin contadores no es fatal */
    }
  }, []);

  // ── búsqueda con debounce (ESC-08) ────────────────────────────────────────
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // ── lista (ESC-04/07/08/09) ───────────────────────────────────────────────
  const listQuery = useMemo(
    () => ({ folder, saved, unreadOnly, search: debouncedSearch }),
    [folder, saved, unreadOnly, debouncedSearch],
  );

  const loadList = useCallback(async (reset: boolean, cursor?: string) => {
    setLoadingList(true);
    setListError(null);
    try {
      const page = await api.listArticles({ ...listQuery, cursor });
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      setNextCursor(page.nextCursor);
      setHiddenByMutes(page.hiddenByMutes);
    } catch (err) {
      setListError((err as Error).message); // FE-05
    } finally {
      setLoadingList(false);
    }
  }, [listQuery]);

  useEffect(() => {
    void loadList(true);
  }, [loadList]);

  // ── abrir artículo = detalle + marcar leído (ESC-05/06) ───────────────────
  const open = useCallback(async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    setDetail(null);
    try {
      const d = await api.articleDetail(id);
      setDetail(d);
      if (!d.isRead) {
        setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
        await api.setRead(id, true);
        void refreshFolders();
      }
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [refreshFolders]);

  const toggleRead = useCallback(async (id: string, read: boolean) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: read } : a)));
    setDetail((d) => (d && d.id === id ? { ...d, isRead: read } : d));
    await api.setRead(id, read).catch(() => undefined);
    void refreshFolders();
  }, [refreshFolders]);

  const toggleStar = useCallback(async (id: string, starred: boolean) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isStarred: starred } : a)));
    setDetail((d) => (d && d.id === id ? { ...d, isStarred: starred } : d));
    await api.setStar(id, starred).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(async () => {
    await api.markAllRead(saved ? undefined : folder).catch(() => undefined);
    setItems((prev) => prev.map((a) => ({ ...a, isRead: true })));
    void refreshFolders();
  }, [folder, saved, refreshFolders]);

  // ── mutes (ESC-10) ────────────────────────────────────────────────────────
  const addMute = useCallback(async () => {
    const term = muteInput.trim();
    setMuteInput('');
    if (!term) return;
    setMutes(await api.addMute(term).catch(() => mutes));
    void loadList(true);
    void refreshFolders();
  }, [muteInput, mutes, loadList, refreshFolders]);

  const removeMute = useCallback(async (term: string) => {
    setMutes(await api.removeMute(term).catch(() => mutes));
    void loadList(true);
    void refreshFolders();
  }, [mutes, loadList, refreshFolders]);

  // ── tema (ESC-13) ─────────────────────────────────────────────────────────
  const toggleTheme = useCallback(() => {
    const next = !dark;
    setDark(next);
    void api.setTheme(next ? 'dark' : 'light').catch(() => undefined);
  }, [dark]);

  // ── refrescar (ingesta manual) ────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.ingest();
      await loadList(true);
      void refreshFolders();
    } catch {
      /* la ingesta puede tardar; el cron la completa */
    } finally {
      setRefreshing(false);
    }
  }, [loadList, refreshFolders]);

  const unreadByFolder = useMemo(() => {
    const map: Record<string, number> = { all: 0 };
    for (const f of folders) {
      map[f.key] = f.unreadCount;
      map.all += f.unreadCount;
    }
    return map;
  }, [folders]);

  const currentTitle = saved ? 'Guardados' : (FOLDERS.find((f) => f.id === folder)?.label ?? 'Todos');
  const selected = detail;

  const iconBtn: CSSProperties = { width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, cursor: 'pointer' };
  const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, fontFamily: SN.font.body, fontSize: 13, fontWeight: 600, cursor: 'pointer' };

  const sanitizedContent = useMemo(
    () => (selected ? DOMPurify.sanitize(selected.fullContent, { FORBID_TAGS: ['style', 'form', 'input'] }) : ''),
    [selected],
  );

  return (
    <>
      <style>{`
        .sn-input::placeholder{color:${t.textMuted};opacity:1;font-family:${SN.font.body};font-size:14px;}
        .sn-hover:hover{background:var(--hover)!important;}
        .sn-iconbtn:hover{background:var(--surf3)!important;color:${t.textPrimary}!important;}
        .sn-chip-x{display:grid;place-items:center;cursor:pointer;opacity:.65;}
        .sn-chip-x:hover{opacity:1;}
        .scroll-y{overflow-y:auto;}
        .scroll-y::-webkit-scrollbar{width:8px;}
        .scroll-y::-webkit-scrollbar-thumb{background:var(--sb);border-radius:8px;}
        .scroll-y::-webkit-scrollbar-track{background:transparent;}
        .sn-content{font-family:${SN.font.body};font-size:16px;line-height:1.65;color:${t.textSecondary};}
        .sn-content p{margin:0 0 18px;}
        .sn-content img{max-width:100%;height:auto;border-radius:${SN.radius.lg}px;margin:8px 0;}
        .sn-content figure{margin:16px 0;}
        .sn-content figcaption{font-size:13px;color:${t.textTertiary};margin-top:6px;}
        .sn-content a{color:${dark ? SN.blue[300] : SN.blue[600]};text-decoration:none;border-bottom:1px solid ${t.border};}
        .sn-content a:hover{border-bottom-color:${dark ? SN.blue[300] : SN.blue[600]};}
        .sn-content pre{background:${t.surface2};border:1px solid ${t.borderSubtle};border-radius:${SN.radius.lg}px;padding:14px;overflow-x:auto;font-size:13.5px;line-height:1.55;}
        .sn-content code{font-family:${SN.font.mono};font-size:0.9em;background:${t.surface2};padding:1px 5px;border-radius:4px;}
        .sn-content pre code{background:transparent;padding:0;}
        .sn-content blockquote{margin:16px 0;padding:4px 16px;border-left:3px solid ${SN.brand.teal};color:${t.textTertiary};}
        .sn-content h1,.sn-content h2,.sn-content h3,.sn-content h4{font-family:${SN.font.title};color:${t.textPrimary};line-height:1.3;margin:26px 0 12px;}
        .sn-content h1{font-size:22px}.sn-content h2{font-size:19px}.sn-content h3{font-size:17px}.sn-content h4{font-size:15px}
        .sn-content ul,.sn-content ol{margin:0 0 18px;padding-left:24px;}
        .sn-content li{margin-bottom:6px;}
        .sn-content table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;display:block;overflow-x:auto;}
        .sn-content th,.sn-content td{border:1px solid ${t.border};padding:6px 10px;text-align:left;}
        .sn-content hr{border:none;border-top:1px solid ${t.border};margin:24px 0;}
      `}</style>

      <div style={{ '--hover': t.hover, '--surf3': t.surface3, '--sb': t.sb, fontFamily: SN.font.body, background: t.appBg, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' } as CSSProperties}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bg, minHeight: 0 }}>

          {/* Top bar */}
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56, borderBottom: `1px solid ${t.border}`, background: t.surface1, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
                <span style={{ width: 5, height: 16, borderRadius: 2, background: SN.brand.blue }} />
                <span style={{ width: 5, height: 20, borderRadius: 2, background: SN.brand.teal }} />
                <span style={{ width: 5, height: 13, borderRadius: 2, background: SN.brand.coral }} />
              </div>
              <span style={{ fontFamily: SN.font.title, fontWeight: 800, fontSize: 19, color: t.textPrimary, letterSpacing: '-0.01em' }}>Señal</span>
              <span style={{ fontFamily: SN.font.body, fontSize: 12, color: t.textTertiary, marginTop: 3 }}>· tu industria, sin ruido</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="sn-iconbtn" style={ghostBtn} onClick={() => void refresh()} disabled={refreshing} title="Buscar artículos nuevos">
                <IcRefresh s={15} /> {refreshing ? 'Actualizando…' : 'Actualizar'}
              </button>
              <button className="sn-iconbtn" style={ghostBtn} onClick={() => void markAllRead()}><IcCheck s={15} /> Marcar todo leído</button>
              <button className="sn-iconbtn" style={iconBtn} onClick={toggleTheme} title="Tema">{dark ? <IcSun s={17} /> : <IcMoon s={17} />}</button>
            </div>
          </header>

          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

            {/* Sidebar */}
            <nav className="scroll-y" style={{ width: 236, flexShrink: 0, borderRight: `1px solid ${t.border}`, background: t.surface1, padding: '16px 12px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: SN.font.body, fontWeight: 600, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.textTertiary, padding: '0 8px 8px' }}>Carpetas</div>
              {FOLDERS.map(({ id, label, Icon }) => {
                const active = !saved && folder === id;
                const n = unreadByFolder[id] ?? 0;
                return (
                  <button key={id} onClick={() => { setFolder(id); setSaved(false); }} className={active ? '' : 'sn-hover'}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', marginBottom: 2, border: 'none', cursor: 'pointer', borderRadius: SN.radius.base, textAlign: 'left', background: active ? t.activeBg : 'transparent', color: active ? t.activeText : t.textSecondary, fontFamily: SN.font.body, fontWeight: 500, fontSize: 14, position: 'relative' }}>
                    {active && <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: t.activeBar }} />}
                    <span style={{ display: 'grid', placeItems: 'center', color: active ? t.activeText : t.textTertiary }}><Icon s={18} /></span>
                    <span style={{ flex: 1 }}>{label}</span>
                    {n > 0 && <Pill bg={active ? t.bg : t.surface3} color={active ? t.activeText : t.textTertiary} mono>{n > 999 ? '999+' : n}</Pill>}
                  </button>
                );
              })}

              <div style={{ height: 1, background: t.borderSubtle, margin: '12px 8px' }} />
              <button onClick={() => setSaved(true)} className={saved ? '' : 'sn-hover'}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', border: 'none', cursor: 'pointer', borderRadius: SN.radius.base, textAlign: 'left', background: saved ? t.activeBg : 'transparent', color: saved ? t.activeText : t.textSecondary, fontFamily: SN.font.body, fontWeight: 500, fontSize: 14 }}>
                <span style={{ color: saved ? t.activeText : SN.brand.coral }}><IcStarF s={17} /></span>
                <span style={{ flex: 1 }}>Guardados</span>
              </button>

              <div style={{ marginTop: 'auto', padding: '12px 8px 0' }}>
                <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                  {feedsCount} fuentes{hiddenByMutes > 0 ? ` · ${hiddenByMutes} silenciados` : ''}
                </div>
              </div>
            </nav>

            {/* Lista */}
            <section style={{ width: 376, flexShrink: 0, borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg }}>
              <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${t.borderSubtle}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <h2 style={{ margin: 0, fontFamily: SN.font.title, fontWeight: 700, fontSize: 20, color: t.textPrimary, letterSpacing: '-0.01em' }}>{currentTitle}</h2>
                    <span style={{ fontFamily: SN.font.body, fontSize: 13, color: t.textTertiary }}>{items.length}{nextCursor ? '+' : ''}</span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ fontSize: 12, color: t.textTertiary, fontWeight: 500 }}>No leídos</span>
                    <span onClick={() => setUnreadOnly(!unreadOnly)} style={{ width: 34, height: 20, borderRadius: 999, background: unreadOnly ? SN.brand.teal : t.surface3, border: `1px solid ${unreadOnly ? SN.brand.teal : t.border}`, position: 'relative', transition: 'all .18s', cursor: 'pointer' }}>
                      <span style={{ position: 'absolute', top: 1, left: unreadOnly ? 15 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .18s' }} />
                    </span>
                  </label>
                </div>

                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', border: `1px solid ${t.border}`, borderRadius: SN.radius.base, background: t.surface1, marginBottom: 10 }}>
                  <span style={{ color: t.textMuted }}><IcSearch s={16} /></span>
                  <input className="sn-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en tus feeds…"
                    style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontFamily: SN.font.body, fontSize: 14, color: t.textPrimary }} />
                </div>

                {/* Mute / ruido */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: t.textTertiary, fontSize: 12, fontWeight: 500 }}><IcFilter s={14} /> Silenciar:</span>
                  {mutes.map((m) => (
                    <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: t.tldrBg, color: t.tldrText, border: `1px solid ${t.tldrBorder}`, borderRadius: SN.radius.full, padding: '3px 6px 3px 9px', fontSize: 12, fontWeight: 600 }}>
                      {m}<span className="sn-chip-x" onClick={() => void removeMute(m)}><IcX s={13} /></span>
                    </span>
                  ))}
                  <input className="sn-input" value={muteInput} onChange={(e) => setMuteInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addMute()} placeholder="+ palabra"
                    style={{ border: `1px dashed ${t.border}`, outline: 'none', background: 'transparent', borderRadius: SN.radius.full, padding: '3px 10px', width: 78, fontFamily: SN.font.body, fontSize: 12, color: t.textPrimary }} />
                </div>
                {hiddenByMutes > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: t.textMuted }}>{hiddenByMutes} {hiddenByMutes === 1 ? 'artículo oculto' : 'artículos ocultos'} por filtros de ruido</div>
                )}
              </div>

              {/* Items */}
              <div className="scroll-y" style={{ flex: 1, minHeight: 0 }}>
                {listError ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                    <div style={{ fontFamily: SN.font.title, fontWeight: 600, fontSize: 16, color: t.textPrimary, marginBottom: 4 }}>No se pudo cargar</div>
                    <div style={{ fontSize: 13, color: t.textTertiary, marginBottom: 16 }}>{listError}</div>
                    <button style={ghostBtn} className="sn-iconbtn" onClick={() => void loadList(true)}>Reintentar</button>
                  </div>
                ) : items.length === 0 && !loadingList ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', background: t.surface3, color: t.textTertiary, display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><IcSearch s={26} /></div>
                    <div style={{ fontFamily: SN.font.title, fontWeight: 600, fontSize: 16, color: t.textPrimary, marginBottom: 4 }}>Nada por aquí</div>
                    <div style={{ fontSize: 13, color: t.textTertiary, marginBottom: 16 }}>Ajusta la búsqueda o los filtros.</div>
                    <button style={ghostBtn} className="sn-iconbtn" onClick={() => { setSearch(''); setUnreadOnly(false); }}>Limpiar filtros</button>
                  </div>
                ) : (
                  <>
                    {items.map((a) => {
                      const isSel = a.id === selectedId;
                      return (
                        <div key={a.id} onClick={() => void open(a.id)} className={isSel ? '' : 'sn-hover'}
                          style={{ display: 'flex', gap: 12, padding: '14px 16px', cursor: 'pointer', borderBottom: `1px solid ${t.borderSubtle}`, background: isSel ? t.activeBg : 'transparent', position: 'relative' }}>
                          {isSel && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: t.activeBar }} />}
                          <div style={{ flexShrink: 0, paddingTop: 4 }}>
                            {!a.isRead ? <span style={{ color: a.dotColor, display: 'block' }}><IcCircle s={8} /></span> : <span style={{ width: 8, height: 8, display: 'block' }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ color: a.dotColor, display: 'flex' }}><IcCircle s={7} /></span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary }}>{a.source}</span>
                              <span style={{ fontSize: 12, color: t.textMuted }}>· {timeAgo(a.publishedAt)}</span>
                            </div>
                            <div style={{ fontFamily: SN.font.title, fontWeight: 600, fontSize: 15, lineHeight: 1.35, color: a.isRead ? t.textTertiary : t.textPrimary, marginBottom: 4 }}>{a.title}</div>
                            <div style={{ fontSize: 13, lineHeight: 1.5, color: t.textTertiary, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{a.excerpt}</div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); void toggleStar(a.id, !a.isStarred); }} title="Guardar"
                            style={{ flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: a.isStarred ? SN.brand.coral : t.textMuted, padding: 2, alignSelf: 'flex-start' }}>
                            {a.isStarred ? <IcStarF s={16} /> : <IcStar s={16} />}
                          </button>
                        </div>
                      );
                    })}
                    {nextCursor && (
                      <div style={{ padding: 16, textAlign: 'center' }}>
                        <button style={ghostBtn} className="sn-iconbtn" disabled={loadingList} onClick={() => void loadList(false, nextCursor)}>
                          {loadingList ? 'Cargando…' : 'Cargar más'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* Reader */}
            <article className="scroll-y" style={{ flex: 1, minWidth: 0, background: t.bg }}>
              {!selectedId ? (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>
                  <div style={{ textAlign: 'center', color: t.textTertiary }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: t.surface3, display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><IcInbox s={28} /></div>
                    <div style={{ fontFamily: SN.font.title, fontWeight: 600, fontSize: 17, color: t.textPrimary }}>Selecciona un artículo</div>
                  </div>
                </div>
              ) : loadingDetail || !selected ? (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: t.textTertiary, fontSize: 14 }}>
                  {loadingDetail ? 'Cargando artículo…' : 'No se pudo cargar el artículo.'}
                </div>
              ) : (
                <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 40px 60px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: selected.dotColor, display: 'flex' }}><IcCircle s={9} /></span>
                      <span style={{ fontFamily: SN.font.body, fontWeight: 600, fontSize: 14, color: t.textSecondary }}>{selected.source}</span>
                      <span style={{ fontSize: 13, color: t.textMuted }}>· {timeAgo(selected.publishedAt)}</span>
                      {selected.author && <span style={{ fontSize: 13, color: t.textMuted }}>· {selected.author}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="sn-iconbtn" style={{ ...iconBtn, color: selected.isStarred ? SN.brand.coral : t.textSecondary }} onClick={() => void toggleStar(selected.id, !selected.isStarred)} title="Guardar">
                        {selected.isStarred ? <IcStarF s={17} /> : <IcStar s={17} />}
                      </button>
                      <a className="sn-iconbtn" style={{ ...iconBtn, textDecoration: 'none' }} href={selected.link} target="_blank" rel="noopener noreferrer" title="Abrir original"><IcExt s={16} /></a>
                      <button className="sn-iconbtn" style={ghostBtn} onClick={() => void toggleRead(selected.id, !selected.isRead)}>
                        {selected.isRead ? 'Marcar no leído' : 'Marcar leído'}
                      </button>
                    </div>
                  </div>

                  <h1 style={{ margin: '0 0 20px', fontFamily: SN.font.title, fontWeight: 700, fontSize: 27, lineHeight: 1.25, letterSpacing: '-0.015em', color: t.textPrimary }}>{selected.title}</h1>

                  {selected.tldr && (
                    <div style={{ background: t.tldrBg, border: `1px solid ${t.tldrBorder}`, borderRadius: SN.radius.lg, padding: '14px 16px', marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: t.tldrText }}>
                        <IcSpark s={15} />
                        <span style={{ fontFamily: SN.font.body, fontWeight: 600, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>TL;DR · IA</span>
                      </div>
                      <div style={{ fontFamily: SN.font.body, fontSize: 14, lineHeight: 1.55, color: t.textSecondary }}>{selected.tldr}</div>
                    </div>
                  )}

                  {/* Cuerpo completo dentro de la app (ESC-05) — doble sanitización (RS-3) */}
                  <div className="sn-content" dangerouslySetInnerHTML={{ __html: sanitizedContent }} />

                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '5px 10px', borderRadius: SN.radius.full, background: t.surface2, border: `1px solid ${t.borderSubtle}`, color: selected.contentStatus === 'full' ? SN.brand.teal : SN.brand.coral, fontSize: 12, fontWeight: 600 }}>
                    <IcCheck s={14} />
                    <span style={{ color: t.textTertiary }}>
                      {selected.contentStatus === 'full' ? 'Contenido completo cargado' : 'Resumen del feed — abre el original para el texto completo'}
                    </span>
                  </div>
                </div>
              )}
            </article>
          </div>
        </div>
      </div>
    </>
  );
}
