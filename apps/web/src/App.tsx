import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { SN, THEMES, THEME_LABELS, ThemeKey, applyAccent } from './tokens';
import {
  IcActivity, IcBack, IcChat, IcCheck, IcCircle, IcCode, IcCpu, IcDb, IcExt, IcFilter, IcGear, IcInbox,
  IcPalette, IcPlus, IcRefresh, IcSearch, IcShield, IcSpark, IcStar, IcStarF, IcTag, IcType, IcX, LogoMark,
} from './icons';
import { api, ArticleDetail, ArticleListItem, DigestItem, FeedInfo, Folder, timeAgo } from './api';
import { SettingsModal } from './SettingsModal';
import { DiscoverModal } from './DiscoverModal';
import { LiveConsole } from './LiveConsole';
import { ChatSheet } from './ChatSheet';
import { SelectionTranslator } from './SelectionTranslator';
import { AudioPlayer } from './AudioPlayer';
import {
  ACCENT_PRESETS, GesturePrefs, READING_SIZES, READING_WIDTH_LABELS, READING_WIDTHS, ReadingPrefs,
  SIDEBAR_MAX, SIDEBAR_MIN, loadAccent, loadGestures, loadReading, loadSidebarWidth,
  saveAccent, saveGestures, saveReading, saveSidebarWidth,
} from './local-prefs';

const FOLDER_ICONS: Record<string, (p: { s?: number }) => React.ReactElement> = {
  ai: IcCpu, dev: IcCode, sql: IcDb, sec: IcShield,
};
const iconFor = (key: string) => FOLDER_ICONS[key] ?? IcTag;

const SWIPE_TRIGGER = 72;

function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function Pill({ children, bg, color, mono }: { children: React.ReactNode; bg: string; color: string; mono?: boolean }) {
  return (
    <span style={{ background: bg, color, fontFamily: mono ? SN.font.mono : SN.font.body, fontSize: mono ? 11 : 12, fontWeight: 600, padding: '2px 8px', borderRadius: SN.radius.full, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeKey>('light');
  const [accent, setAccent] = useState<string | null>(loadAccent);
  const t = useMemo(() => applyAccent(THEMES[theme], accent), [theme, accent]);

  const width = useViewportWidth();
  const compact = width < 1100; // sin sidebar → chips
  const phone = width < 700; // artículo overlay + FAB + sheet

  const [folder, setFolder] = useState('all');
  const [saved, setSaved] = useState(false);
  const [digestMode, setDigestMode] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [items, setItems] = useState<ArticleListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hiddenByMutes, setHiddenByMutes] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [digestItems, setDigestItems] = useState<DigestItem[]>([]);
  const [loadingDigest, setLoadingDigest] = useState(false);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [feeds, setFeeds] = useState<FeedInfo[]>([]);
  const [mutes, setMutes] = useState<string[]>([]);
  const [muteInput, setMuteInput] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [readMenuOpen, setReadMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [barsHidden, setBarsHidden] = useState(false);

  const [reading, setReading] = useState<ReadingPrefs>(loadReading);
  const [gestures, setGestures] = useState<GesturePrefs>(loadGestures);
  const [sidebarW, setSidebarW] = useState(loadSidebarWidth);
  const draggingSidebar = useRef(false);
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const swipeRef = useRef<{ id: string; x: number; y: number; horizontal: boolean | null } | null>(null);
  const edgeRef = useRef<number | null>(null);

  const articlePaneRef = useRef<HTMLElement | null>(null);
  const lastScrollTop = useRef(0);
  const [readProgress, setReadProgress] = useState(0);
  const [backToast, setBackToast] = useState(false);
  const exitArmed = useRef(false);
  const uiRef = useRef({ selectedId: null as string | null, sheetOpen: false, showSettings: false, showConsole: false, showDiscover: false, showChat: false });

  // ── carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    api.getPrefs().then((p) => setTheme(p.theme in THEMES ? p.theme : 'light')).catch(() => undefined);
    api.mutes().then(setMutes).catch(() => undefined);
    void refreshFeeds();
    void refreshFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PWA: capturar el evento de instalación para ofrecer un botón "Instalar app"
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const doInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  const refreshFolders = useCallback(async () => {
    try { setFolders(await api.folders()); } catch { /* no fatal */ }
  }, []);
  const refreshFeeds = useCallback(async () => {
    try { setFeeds(await api.feeds()); } catch { /* no fatal */ }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // ── lista ─────────────────────────────────────────────────────────────────
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
      setListError((err as Error).message);
    } finally {
      setLoadingList(false);
    }
  }, [listQuery]);

  useEffect(() => {
    if (!digestMode) void loadList(true);
  }, [loadList, digestMode]);

  const loadDigest = useCallback(async () => {
    setLoadingDigest(true);
    try {
      const d = await api.digest(24);
      setDigestItems(d.items);
    } catch { /* mostrar vacío */ } finally {
      setLoadingDigest(false);
    }
  }, []);

  useEffect(() => {
    if (digestMode) void loadDigest();
  }, [digestMode, loadDigest]);

  // ── artículo ──────────────────────────────────────────────────────────────
  const open = useCallback(async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    setDetail(null);
    articlePaneRef.current?.scrollTo(0, 0);
    try {
      const d = await api.articleDetail(id);
      setDetail(d);
      if (!d.isRead) {
        setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
        setDigestItems((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
        await api.setRead(id, true);
        void refreshFolders();
      }
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [refreshFolders]);

  const closeArticle = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
  }, []);

  // ── botón "atrás" del teléfono ────────────────────────────────────────────
  useEffect(() => {
    uiRef.current = { selectedId, sheetOpen, showSettings, showConsole, showDiscover, showChat };
  }, [selectedId, sheetOpen, showSettings, showConsole, showDiscover, showChat]);

  // El "atrás" cierra lo que esté abierto (artículo/paneles) en vez de salir de
  // la app; en la raíz, pide confirmación y sale al segundo "atrás".
  useEffect(() => {
    window.history.pushState({ senal: true }, '');
    const reguard = () => window.history.pushState({ senal: true }, '');
    const onPop = () => {
      const ui = uiRef.current;
      if (ui.showDiscover) { setShowDiscover(false); exitArmed.current = false; reguard(); return; }
      if (ui.showChat) { setShowChat(false); exitArmed.current = false; reguard(); return; }
      if (ui.showConsole) { setShowConsole(false); exitArmed.current = false; reguard(); return; }
      if (ui.showSettings) { setShowSettings(false); exitArmed.current = false; reguard(); return; }
      if (ui.sheetOpen) { setSheetOpen(false); exitArmed.current = false; reguard(); return; }
      if (ui.selectedId) { closeArticle(); exitArmed.current = false; reguard(); return; }
      // en la raíz: doble "atrás" para salir
      if (exitArmed.current) {
        window.removeEventListener('popstate', onPop);
        window.history.back(); // deja salir de verdad
        return;
      }
      exitArmed.current = true;
      setBackToast(true);
      reguard();
      window.setTimeout(() => { exitArmed.current = false; setBackToast(false); }, 2200);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [closeArticle]);

  const toggleRead = useCallback(async (id: string, read: boolean) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: read } : a)));
    setDigestItems((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: read } : a)));
    setDetail((d) => (d && d.id === id ? { ...d, isRead: read } : d));
    await api.setRead(id, read).catch(() => undefined);
    void refreshFolders();
  }, [refreshFolders]);

  const toggleStar = useCallback(async (id: string, starred: boolean) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isStarred: starred } : a)));
    setDigestItems((prev) => prev.map((a) => (a.id === id ? { ...a, isStarred: starred } : a)));
    setDetail((d) => (d && d.id === id ? { ...d, isStarred: starred } : d));
    await api.setStar(id, starred).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(async () => {
    await api.markAllRead(saved || digestMode ? undefined : folder).catch(() => undefined);
    setItems((prev) => prev.map((a) => ({ ...a, isRead: true })));
    setDigestItems((prev) => prev.map((a) => ({ ...a, isRead: true })));
    void refreshFolders();
  }, [folder, saved, digestMode, refreshFolders]);

  // ── mutes ─────────────────────────────────────────────────────────────────
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

  // ── prefs ─────────────────────────────────────────────────────────────────
  const pickTheme = useCallback((key: ThemeKey) => {
    setTheme(key);
    setThemeMenuOpen(false);
    void api.setTheme(key).catch(() => undefined);
  }, []);

  const updateReading = useCallback((next: ReadingPrefs) => {
    setReading(next);
    saveReading(next);
  }, []);

  const updateGestures = useCallback((next: GesturePrefs) => {
    setGestures(next);
    saveGestures(next);
  }, []);

  const updateAccent = useCallback((hex: string | null) => {
    setAccent(hex);
    saveAccent(hex);
  }, []);

  // Drag del borde del sidebar para ensanchar/estrechar (desktop).
  const startSidebarDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingSidebar.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      if (!draggingSidebar.current) return;
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX));
      setSidebarW(w);
    };
    const onUp = () => {
      draggingSidebar.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setSidebarW((w) => { saveSidebarWidth(w); return w; });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.ingest();
      if (digestMode) await loadDigest();
      else await loadList(true);
      void refreshFolders();
    } catch { /* el cron completa */ } finally {
      setRefreshing(false);
    }
  }, [loadList, loadDigest, digestMode, refreshFolders]);

  // ── swipe en filas (móvil) ────────────────────────────────────────────────
  const swipeAction = useCallback((id: string, dx: number) => {
    const dir = dx > 0 ? 'right' : 'left';
    const action = gestures[dir];
    const item = items.find((a) => a.id === id) ?? digestItems.find((a) => a.id === id);
    if (!item || action === 'none') return;
    if (action === 'read') void toggleRead(id, !item.isRead);
    else void toggleStar(id, !item.isStarred);
  }, [gestures, items, digestItems, toggleRead, toggleStar]);

  const rowTouch = phone ? {
    onTouchStart: (id: string) => (e: React.TouchEvent) => {
      const touch = e.touches[0];
      swipeRef.current = { id, x: touch.clientX, y: touch.clientY, horizontal: null };
    },
    onTouchMove: (id: string) => (e: React.TouchEvent) => {
      const s = swipeRef.current;
      if (!s || s.id !== id) return;
      const touch = e.touches[0];
      const dx = touch.clientX - s.x;
      const dy = touch.clientY - s.y;
      if (s.horizontal === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        s.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (s.horizontal) setSwipe({ id, dx: Math.max(-120, Math.min(120, dx)) });
    },
    onTouchEnd: (id: string) => () => {
      const s = swipeRef.current;
      const current = swipe;
      swipeRef.current = null;
      setSwipe(null);
      if (s?.horizontal && current && current.id === id && Math.abs(current.dx) >= SWIPE_TRIGGER) {
        swipeAction(id, current.dx);
      }
    },
  } : null;

  const unreadTotal = useMemo(() => folders.reduce((acc, f) => acc + f.unreadCount, 0), [folders]);
  const currentTitle = digestMode ? 'Hoy' : saved ? 'Guardados' : folder === 'all' ? 'Todos' : (folders.find((f) => f.key === folder)?.label ?? 'Todos');
  const selected = detail;
  const filtersActive = Boolean(debouncedSearch || unreadOnly || mutes.length > 0);

  const iconBtn: CSSProperties = { width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, cursor: 'pointer', flexShrink: 0 };
  const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, fontFamily: SN.font.body, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };

  const sanitizedContent = useMemo(
    () => (selected ? DOMPurify.sanitize(selected.fullContent, { FORBID_TAGS: ['style', 'form', 'input'] }) : ''),
    [selected],
  );

  const fmt = (n: number) => (n > 999 ? '999+' : String(n));

  const selectView = (opts: { folder?: string; saved?: boolean; digest?: boolean }) => {
    setSaved(opts.saved ?? false);
    setDigestMode(opts.digest ?? false);
    if (opts.folder) setFolder(opts.folder);
    setSheetOpen(false);
    setBarsHidden(false);
    if (phone) closeArticle();
  };

  // ── barra de progreso de lectura ──────────────────────────────────────────
  const measureProgress = useCallback((el: HTMLElement) => {
    const max = el.scrollHeight - el.clientHeight;
    setReadProgress(max > 8 ? Math.min(1, el.scrollTop / max) : 1);
  }, []);

  const onArticleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    measureProgress(e.currentTarget);
  }, [measureProgress]);

  // al abrir un artículo, medir tras el render (varias veces: las imágenes cambian la altura)
  useEffect(() => {
    setReadProgress(0);
    if (!selected) return;
    const measure = () => { if (articlePaneRef.current) measureProgress(articlePaneRef.current); };
    const raf = requestAnimationFrame(measure);
    const t1 = setTimeout(measure, 250);
    const t2 = setTimeout(measure, 800);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
  }, [selected, measureProgress]);

  const onListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // scroll infinito: al acercarse al fondo, carga la siguiente página sola
    // (la vista "Hoy" no pagina: es una sola respuesta rankeada)
    if (!digestMode && nextCursor && !loadingList) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 600;
      if (nearBottom) void loadList(false, nextCursor);
    }
    if (!phone) return;
    const top = el.scrollTop;
    const delta = top - lastScrollTop.current;
    if (top > 80 && delta > 8) setBarsHidden(true);
    else if (delta < -8 || top < 40) setBarsHidden(false);
    lastScrollTop.current = top;
  }, [phone, digestMode, nextCursor, loadingList, loadList]);

  // ── piezas ────────────────────────────────────────────────────────────────

  const folderEntries = useMemo(
    () => [{ key: 'all', label: 'Todos', unreadCount: unreadTotal }, ...folders],
    [folders, unreadTotal],
  );

  const themeMenu = themeMenuOpen && (
    <>
      <div onClick={() => setThemeMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 41, background: t.bg, border: `1px solid ${t.border}`, borderRadius: SN.radius.lg, boxShadow: SN.shadow.lg, padding: 6, minWidth: 180 }}>
        {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
          <button key={key} onClick={() => pickTheme(key)} className="sn-hover"
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', border: 'none', background: theme === key ? t.activeBg : 'transparent', color: theme === key ? t.activeText : t.textSecondary, borderRadius: SN.radius.base, cursor: 'pointer', fontFamily: SN.font.body, fontSize: 13.5, fontWeight: 600, textAlign: 'left' }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', border: `1px solid ${t.border}`, background: THEMES[key].appBg, flexShrink: 0 }} />
            {THEME_LABELS[key]}
            {theme === key && <span style={{ marginLeft: 'auto', display: 'flex' }}><IcCheck s={14} /></span>}
          </button>
        ))}

        {/* Color de acento / resaltado */}
        <div style={{ borderTop: `1px solid ${t.borderSubtle}`, marginTop: 6, paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.textTertiary, padding: '0 4px 8px' }}>Acento</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 4px' }}>
            {ACCENT_PRESETS.map((p) => (
              <button key={p.id} onClick={() => updateAccent(p.color)} title={p.label}
                style={{ width: 22, height: 22, borderRadius: '50%', background: p.color, cursor: 'pointer', border: accent === p.color ? `2px solid ${t.textPrimary}` : `1px solid ${t.border}`, padding: 0 }} />
            ))}
            <label title="Color personalizado"
              style={{ width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', border: `1px dashed ${t.textMuted}`, display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative', background: t.surface2 }}>
              <IcPlus s={12} />
              <input type="color" value={accent ?? '#0084ff'} onChange={(e) => updateAccent(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
            </label>
          </div>
          <button onClick={() => updateAccent(null)}
            style={{ marginTop: 8, width: '100%', padding: '6px', borderRadius: SN.radius.base, border: `1px solid ${t.border}`, background: accent ? t.bg : t.activeBg, color: accent ? t.textSecondary : t.activeText, cursor: 'pointer', fontFamily: SN.font.body, fontSize: 12, fontWeight: 600 }}>
            {accent ? 'Usar color del tema' : 'Color del tema ✓'}
          </button>
        </div>
      </div>
    </>
  );

  const readingMenu = readMenuOpen && (
    <>
      <div onClick={() => setReadMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 41, background: t.bg, border: `1px solid ${t.border}`, borderRadius: SN.radius.lg, boxShadow: SN.shadow.lg, padding: 12, width: 264 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.textTertiary, marginBottom: 8 }}>Tamaño de letra</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button className="sn-iconbtn" style={{ ...iconBtn, width: 32, height: 32 }} disabled={reading.size === 0}
            onClick={() => updateReading({ ...reading, size: Math.max(0, reading.size - 1) as ReadingPrefs['size'] })}>A−</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 13, color: t.textSecondary, fontFamily: SN.font.mono }}>{READING_SIZES[reading.size]}px</span>
          <button className="sn-iconbtn" style={{ ...iconBtn, width: 32, height: 32 }} disabled={reading.size === 3}
            onClick={() => updateReading({ ...reading, size: Math.min(3, reading.size + 1) as ReadingPrefs['size'] })}>A+</button>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.textTertiary, marginBottom: 8 }}>Ancho del texto</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {READING_WIDTH_LABELS.map((label, i) => (
            <button key={label} onClick={() => updateReading({ ...reading, width: i as ReadingPrefs['width'] })}
              style={{ flex: 1, minWidth: 0, padding: '6px 3px', borderRadius: SN.radius.base, border: `1px solid ${reading.width === i ? t.activeBar : t.border}`, background: reading.width === i ? t.activeBg : t.bg, color: reading.width === i ? t.activeText : t.textSecondary, cursor: 'pointer', fontFamily: SN.font.body, fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {label}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
          <span style={{ fontSize: 13.5, color: t.textSecondary, fontWeight: 600 }}>Fuente serif</span>
          <span onClick={() => updateReading({ ...reading, serif: !reading.serif })} style={{ width: 34, height: 20, borderRadius: 999, background: reading.serif ? t.activeBar : t.surface3, border: `1px solid ${reading.serif ? t.activeBar : t.border}`, position: 'relative', transition: 'all .18s', cursor: 'pointer' }}>
            <span style={{ position: 'absolute', top: 1, left: reading.serif ? 15 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .18s' }} />
          </span>
        </label>
      </div>
    </>
  );

  const header = (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: phone ? '0 12px' : '0 16px', height: 56, borderBottom: `1px solid ${t.border}`, background: t.surface1, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <LogoMark s={27} />
        <span style={{ fontFamily: SN.font.title, fontWeight: 800, fontSize: 19, color: t.textPrimary, letterSpacing: '-0.01em' }}>Señal</span>
        {!compact && <span style={{ fontFamily: SN.font.body, fontSize: 12, color: t.textTertiary, marginTop: 3 }}>· tu industria, sin ruido</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        <button className="sn-iconbtn" style={phone ? iconBtn : ghostBtn} onClick={() => void refresh()} disabled={refreshing} title="Buscar artículos nuevos">
          <span style={{ display: 'flex', animation: refreshing ? 'sn-spin 1s linear infinite' : undefined }}><IcRefresh s={15} /></span>
          {!phone && (refreshing ? 'Actualizando…' : 'Actualizar')}
        </button>
        {!phone && (
          <button className="sn-iconbtn" style={ghostBtn} onClick={() => void markAllRead()} title="Marcar todo leído">
            <IcCheck s={15} />Marcar todo leído
          </button>
        )}
        <button className="sn-iconbtn" style={iconBtn} onClick={() => setShowChat(true)} title="Minichat con la IA"><IcChat s={17} /></button>
        <button className="sn-iconbtn" style={iconBtn} onClick={() => setShowConsole(true)} title="Consola IA en vivo"><IcActivity s={17} /></button>
        <button className="sn-iconbtn" style={iconBtn} onClick={() => setShowSettings(true)} title="Ajustes"><IcGear s={17} /></button>
        <button className="sn-iconbtn" style={iconBtn} onClick={() => { setThemeMenuOpen((v) => !v); setReadMenuOpen(false); }} title="Tema"><IcPalette s={17} /></button>
        {themeMenu}
      </div>
    </header>
  );

  const sidebar = !compact && (
    <nav className="scroll-y" style={{ width: sidebarW, flexShrink: 0, borderRight: `1px solid ${t.border}`, background: t.surface1, padding: '16px 12px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <button onClick={() => selectView({ digest: true })} className={digestMode ? '' : 'sn-hover'}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', marginBottom: 10, border: `1px solid ${digestMode ? t.activeBar : t.border}`, cursor: 'pointer', borderRadius: SN.radius.lg, textAlign: 'left', background: digestMode ? t.activeBg : t.bg, color: digestMode ? t.activeText : t.textSecondary, fontFamily: SN.font.body, fontWeight: 600, fontSize: 14 }}>
        <span style={{ color: digestMode ? t.activeText : SN.brand.teal, display: 'flex' }}><IcSpark s={17} /></span>
        <span style={{ flex: 1 }}>Hoy</span>
        <span style={{ fontSize: 11, color: t.textMuted }}>24 h</span>
      </button>

      <div style={{ fontFamily: SN.font.body, fontWeight: 600, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.textTertiary, padding: '0 8px 8px' }}>Carpetas</div>
      {folderEntries.map(({ key, label, unreadCount }) => {
        const active = !saved && !digestMode && folder === key;
        const Icon = key === 'all' ? IcInbox : iconFor(key);
        return (
          <button key={key} onClick={() => selectView({ folder: key })} className={active ? '' : 'sn-hover'}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', marginBottom: 2, border: 'none', cursor: 'pointer', borderRadius: SN.radius.base, textAlign: 'left', background: active ? t.activeBg : 'transparent', color: active ? t.activeText : t.textSecondary, fontFamily: SN.font.body, fontWeight: 500, fontSize: 14, position: 'relative' }}>
            {active && <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: t.activeBar }} />}
            <span style={{ display: 'grid', placeItems: 'center', color: active ? t.activeText : t.textTertiary }}><Icon s={18} /></span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            {unreadCount > 0 && <Pill bg={active ? t.bg : t.surface3} color={active ? t.activeText : t.textTertiary} mono>{fmt(unreadCount)}</Pill>}
          </button>
        );
      })}

      <div style={{ height: 1, background: t.borderSubtle, margin: '12px 8px' }} />
      <button onClick={() => selectView({ saved: true })} className={saved ? '' : 'sn-hover'}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', border: 'none', cursor: 'pointer', borderRadius: SN.radius.base, textAlign: 'left', background: saved ? t.activeBg : 'transparent', color: saved ? t.activeText : t.textSecondary, fontFamily: SN.font.body, fontWeight: 500, fontSize: 14 }}>
        <span style={{ color: saved ? t.activeText : SN.brand.coral }}><IcStarF s={17} /></span>
        <span style={{ flex: 1 }}>Guardados</span>
      </button>

      <div style={{ marginTop: 'auto', padding: '12px 8px 0' }}>
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
          {feeds.length} fuentes{hiddenByMutes > 0 ? ` · ${hiddenByMutes} silenciados` : ''}
        </div>
      </div>

      {/* asa para arrastrar el ancho del sidebar */}
      <div onPointerDown={startSidebarDrag} title="Arrastra para ajustar el ancho"
        style={{ position: 'absolute', top: 0, right: -3, width: 7, height: '100%', cursor: 'col-resize', zIndex: 5 }} />
    </nav>
  );

  const chipStyle = (active: boolean, accent = false): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: SN.radius.full,
    border: `1px solid ${active ? t.activeBar : t.border}`, background: active ? t.activeBg : t.bg,
    color: active ? t.activeText : accent ? SN.brand.teal : t.textSecondary,
    fontFamily: SN.font.body, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0,
  });

  const chipsRow = (
    <>
      <button onClick={() => selectView({ digest: true })} style={chipStyle(digestMode, true)}>
        <IcSpark s={13} /><span style={{ color: digestMode ? t.activeText : t.textSecondary }}>Hoy</span>
      </button>
      {folderEntries.map(({ key, label, unreadCount }) => {
        const active = !saved && !digestMode && folder === key;
        return (
          <button key={key} onClick={() => selectView({ folder: key })} style={chipStyle(active)}>
            {label}
            {unreadCount > 0 && <span style={{ fontFamily: SN.font.mono, fontSize: 10.5, color: active ? t.activeText : t.textMuted }}>{fmt(unreadCount)}</span>}
          </button>
        );
      })}
      <button onClick={() => selectView({ saved: true })} style={chipStyle(saved)}>
        <span style={{ color: saved ? t.activeText : SN.brand.coral, display: 'flex' }}><IcStarF s={13} /></span>
        <span>Guardados</span>
      </button>
    </>
  );

  const chips = compact && (
    <div style={{ maxHeight: barsHidden ? 0 : 60, overflow: 'hidden', transition: 'max-height .25s ease', flexShrink: 0, borderBottom: barsHidden ? 'none' : `1px solid ${t.border}`, background: t.surface1 }}>
      <div className="sn-chips" style={{ display: 'flex', gap: 6, padding: '10px 12px', overflowX: 'auto' }}>
        {chipsRow}
      </div>
    </div>
  );

  const searchBox = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', border: `1px solid ${t.border}`, borderRadius: SN.radius.base, background: t.surface1, marginBottom: 8 }}>
      <span style={{ color: t.textMuted, display: 'flex' }}><IcSearch s={16} /></span>
      <input className="sn-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en tus feeds…"
        style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontFamily: SN.font.body, fontSize: 14, color: t.textPrimary, minWidth: 0 }} />
      {search && <span className="sn-chip-x" onClick={() => setSearch('')} style={{ color: t.textMuted }}><IcX s={14} /></span>}
    </div>
  );

  const mutesRow = (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: t.textTertiary, fontSize: 12, fontWeight: 500 }}><IcFilter s={14} /> Silenciar:</span>
      {mutes.map((m) => (
        <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: t.tldrBg, color: t.tldrText, border: `1px solid ${t.tldrBorder}`, borderRadius: SN.radius.full, padding: '3px 6px 3px 9px', fontSize: 12, fontWeight: 600 }}>
          {m}<span className="sn-chip-x" onClick={() => void removeMute(m)}><IcX s={13} /></span>
        </span>
      ))}
      <input className="sn-input" value={muteInput} onChange={(e) => setMuteInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addMute()} placeholder="+ palabra"
        style={{ border: `1px dashed ${t.border}`, outline: 'none', background: 'transparent', borderRadius: SN.radius.full, padding: '4px 10px', width: 82, fontFamily: SN.font.body, fontSize: 12, color: t.textPrimary }} />
    </div>
  );

  const unreadToggle = (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <span style={{ fontSize: 12, color: t.textTertiary, fontWeight: 500 }}>No leídos</span>
      <span onClick={() => setUnreadOnly(!unreadOnly)} style={{ width: 34, height: 20, borderRadius: 999, background: unreadOnly ? SN.brand.teal : t.surface3, border: `1px solid ${unreadOnly ? SN.brand.teal : t.border}`, position: 'relative', transition: 'all .18s', cursor: 'pointer', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 1, left: unreadOnly ? 15 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .18s' }} />
      </span>
    </label>
  );

  const metaLine = (a: ArticleListItem) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, minWidth: 0 }}>
      <span style={{ color: a.dotColor, display: 'flex', flexShrink: 0 }}><IcCircle s={7} /></span>
      <span style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.source}</span>
      <span style={{ fontSize: 12, color: t.textMuted, whiteSpace: 'nowrap' }}>· {timeAgo(a.publishedAt)}</span>
      {a.readingMinutes && <span style={{ fontSize: 12, color: t.textMuted, whiteSpace: 'nowrap' }}>· {a.readingMinutes} min</span>}
    </div>
  );

  const articleRow = (a: ArticleListItem, opts?: { score?: number; relevant?: boolean }) => {
    const isSel = a.id === selectedId && !phone;
    const dx = swipe?.id === a.id ? swipe.dx : 0;
    const actionFor = dx > 0 ? gestures.right : gestures.left;
    const showDigestCard = opts?.score !== undefined;
    const row = (
      <div onClick={() => void open(a.id)} className={isSel ? '' : 'sn-hover'}
        {...(rowTouch ? { onTouchStart: rowTouch.onTouchStart(a.id), onTouchMove: rowTouch.onTouchMove(a.id), onTouchEnd: rowTouch.onTouchEnd(a.id) } : {})}
        style={{ display: 'flex', gap: 12, padding: '14px 16px', cursor: 'pointer', background: isSel ? t.activeBg : t.bg, position: 'relative', transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : 'transform .18s ease' }}>
        {isSel && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: t.activeBar }} />}
        <div style={{ flexShrink: 0, paddingTop: 4 }}>
          {!a.isRead ? <span style={{ color: a.dotColor, display: 'block' }}><IcCircle s={8} /></span> : <span style={{ width: 8, height: 8, display: 'block' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {metaLine(a)}
          <div style={{ fontFamily: SN.font.title, fontWeight: 600, fontSize: 15, lineHeight: 1.35, color: a.isRead ? t.textTertiary : t.textPrimary, marginBottom: 4 }}>
            {a.title}
            {showDigestCard && opts!.relevant && (
              <span style={{ marginLeft: 8, verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center', gap: 3, background: t.activeBg, color: t.activeText, borderRadius: SN.radius.full, padding: '1px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <IcSpark s={10} /> relevante
              </span>
            )}
          </div>
          {showDigestCard && a.tldr ? (
            <div style={{ fontSize: 13, lineHeight: 1.55, color: t.textSecondary }}>{a.tldr}</div>
          ) : a.excerpt && a.excerpt !== 'Comments' ? (
            <div style={{ fontSize: 13, lineHeight: 1.5, color: t.textTertiary, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{a.excerpt}</div>
          ) : null}
        </div>
        {a.imageUrl && (
          <img src={a.imageUrl} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: SN.radius.base, flexShrink: 0, alignSelf: 'center', background: t.surface2 }} />
        )}
        <button onClick={(e) => { e.stopPropagation(); void toggleStar(a.id, !a.isStarred); }} title="Guardar"
          style={{ flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: a.isStarred ? SN.brand.coral : t.textMuted, padding: 6, margin: -4, alignSelf: 'flex-start' }}>
          {a.isStarred ? <IcStarF s={16} /> : <IcStar s={16} />}
        </button>
      </div>
    );

    return (
      <div key={a.id} style={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${t.borderSubtle}` }}>
        {dx !== 0 && actionFor !== 'none' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: dx > 0 ? 'flex-start' : 'flex-end', padding: '0 20px', background: actionFor === 'read' ? 'rgba(49,173,255,0.18)' : 'rgba(232,114,255,0.18)', color: actionFor === 'read' ? SN.brand.teal : SN.brand.coral }}>
            {actionFor === 'read' ? <IcCheck s={20} /> : <IcStarF s={20} />}
          </div>
        )}
        {row}
      </div>
    );
  };

  const digestPane = (
    <div className="scroll-y" onScroll={onListScroll} style={{ flex: 1, minHeight: 0 }}>
      <div style={{ padding: '12px 16px 6px', color: t.textMuted, fontSize: 12.5 }}>
        Lo más relevante de las últimas 24 h según tus intereses (editables en Ajustes ⚙).
      </div>
      {loadingDigest ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: t.textTertiary, fontSize: 14 }}>Armando tu resumen…</div>
      ) : digestItems.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: t.surface3, color: t.textTertiary, display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><IcSpark s={26} /></div>
          <div style={{ fontFamily: SN.font.title, fontWeight: 600, fontSize: 16, color: t.textPrimary, marginBottom: 4 }}>Sin artículos en 24 h</div>
          <div style={{ fontSize: 13, color: t.textTertiary }}>Pulsa Actualizar o espera al próximo ciclo.</div>
        </div>
      ) : (
        (() => {
          // "relevante" es relativo al tope de la lista (funciona con score
          // semántico 0–100 o de keywords), marcando solo lo más afín.
          const maxScore = digestItems.reduce((m, a) => Math.max(m, a.score), 0);
          const threshold = Math.max(4, maxScore * 0.82);
          return digestItems.map((a) => articleRow(a, { score: a.score, relevant: a.score >= threshold }));
        })()
      )}
    </div>
  );

  const listPane = (
    <section style={{ width: phone ? '100%' : compact ? 340 : 376, flexShrink: 0, borderRight: phone ? 'none' : `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg, flex: phone ? 1 : undefined }}>
      <div style={{ padding: phone ? '10px 16px 8px' : '12px 16px 10px', borderBottom: `1px solid ${t.borderSubtle}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h2 style={{ margin: 0, fontFamily: SN.font.title, fontWeight: 700, fontSize: 19, color: t.textPrimary, letterSpacing: '-0.01em' }}>{currentTitle}</h2>
            <span style={{ fontFamily: SN.font.body, fontSize: 13, color: t.textTertiary }}>
              {digestMode ? digestItems.length : `${items.length}${nextCursor ? '+' : ''}`}
            </span>
          </div>
          {!phone && !digestMode && unreadToggle}
        </div>

        {!phone && !digestMode && (
          <div style={{ marginTop: 10 }}>
            {searchBox}
            {mutesRow}
            {hiddenByMutes > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: t.textMuted }}>{hiddenByMutes} {hiddenByMutes === 1 ? 'artículo oculto' : 'artículos ocultos'} por filtros de ruido</div>
            )}
          </div>
        )}
      </div>

      {digestMode ? digestPane : (
        <div className="scroll-y" onScroll={onListScroll} style={{ flex: 1, minHeight: 0 }}>
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
              {items.map((a) => articleRow(a))}
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
      )}
    </section>
  );

  const contentFont = reading.serif ? SN.font.serif : SN.font.body;
  const contentSize = READING_SIZES[reading.size];
  const readingW = READING_WIDTHS[reading.width];
  const columnMax = phone || readingW === Infinity ? '100%' : readingW;

  const articleBody = !selectedId ? (
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
    <div style={{ maxWidth: columnMax, margin: '0 auto', padding: phone ? '20px 18px 80px' : '28px 40px 60px' }}>
      {!phone && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ color: selected.dotColor, display: 'flex' }}><IcCircle s={9} /></span>
            <span style={{ fontFamily: SN.font.body, fontWeight: 600, fontSize: 14, color: t.textSecondary }}>{selected.source}</span>
            <span style={{ fontSize: 13, color: t.textMuted }}>· {timeAgo(selected.publishedAt)}</span>
            {selected.readingMinutes && <span style={{ fontSize: 13, color: t.textMuted }}>· {selected.readingMinutes} min</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            <AudioPlayer t={t} article={selected} phone={phone} />
            <button className="sn-iconbtn" style={iconBtn} onClick={() => { setReadMenuOpen((v) => !v); setThemeMenuOpen(false); }} title="Lectura"><IcType s={16} /></button>
            <button className="sn-iconbtn" style={{ ...iconBtn, color: selected.isStarred ? SN.brand.coral : t.textSecondary }} onClick={() => void toggleStar(selected.id, !selected.isStarred)} title="Guardar">
              {selected.isStarred ? <IcStarF s={17} /> : <IcStar s={17} />}
            </button>
            <a className="sn-iconbtn" style={{ ...iconBtn, textDecoration: 'none' }} href={selected.link} target="_blank" rel="noopener noreferrer" title="Abrir original"><IcExt s={16} /></a>
            <button className="sn-iconbtn" style={ghostBtn} onClick={() => void toggleRead(selected.id, !selected.isRead)}>
              {selected.isRead ? 'Marcar no leído' : 'Marcar leído'}
            </button>
            {readingMenu}
          </div>
        </div>
      )}

      {phone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <span style={{ color: selected.dotColor, display: 'flex' }}><IcCircle s={8} /></span>
          <span style={{ fontFamily: SN.font.body, fontWeight: 600, fontSize: 13, color: t.textSecondary }}>{selected.source}</span>
          <span style={{ fontSize: 12, color: t.textMuted }}>· {timeAgo(selected.publishedAt)}</span>
          {selected.readingMinutes && <span style={{ fontSize: 12, color: t.textMuted }}>· {selected.readingMinutes} min</span>}
        </div>
      )}

      <h1 style={{ margin: '0 0 18px', fontFamily: SN.font.title, fontWeight: 700, fontSize: phone ? 23 : 27, lineHeight: 1.25, letterSpacing: '-0.015em', color: t.textPrimary }}>{selected.title}</h1>

      {selected.tldr && (
        <div style={{ background: t.tldrBg, border: `1px solid ${t.tldrBorder}`, borderRadius: SN.radius.lg, padding: '14px 16px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: t.tldrText }}>
            <IcSpark s={15} />
            <span style={{ fontFamily: SN.font.body, fontWeight: 600, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>TL;DR · IA</span>
          </div>
          <div style={{ fontFamily: SN.font.body, fontSize: 14, lineHeight: 1.55, color: t.textSecondary }}>{selected.tldr}</div>
        </div>
      )}

      <div className="sn-content" style={{ fontFamily: contentFont, fontSize: contentSize }} dangerouslySetInnerHTML={{ __html: sanitizedContent }} />

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '5px 10px', borderRadius: SN.radius.full, background: t.surface2, border: `1px solid ${t.borderSubtle}`, color: selected.contentStatus === 'full' ? SN.brand.teal : SN.brand.coral, fontSize: 12, fontWeight: 600 }}>
        <IcCheck s={14} />
        <span style={{ color: t.textTertiary }}>
          {selected.contentStatus === 'full' ? 'Contenido completo cargado' : 'Resumen del feed — abre el original para el texto completo'}
        </span>
      </div>
    </div>
  );

  // barra fina de progreso de lectura, pegada arriba del contenido del artículo.
  // Si hay acento personalizado, lo usa; si no, rosa de marca (azul en sepia).
  const progressColor = accent ?? (theme === 'sepia' ? t.activeBar : SN.brand.coral);
  const progressBar = selected ? (
    <div style={{ position: 'sticky', top: 0, left: 0, right: 0, height: 3, background: t.borderSubtle, zIndex: 6 }}>
      <div style={{ height: '100%', width: `${Math.round(readProgress * 100)}%`, background: progressColor, transition: 'width .1s linear' }} />
    </div>
  ) : null;

  const articleOverlay = phone && selectedId && (
    <div
      onTouchStart={(e) => { edgeRef.current = e.touches[0].clientX < 28 ? e.touches[0].clientX : null; }}
      onTouchMove={(e) => {
        if (edgeRef.current !== null && e.touches[0].clientX - edgeRef.current > 70) {
          edgeRef.current = null;
          closeArticle();
        }
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 30, background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 52, borderBottom: `1px solid ${t.border}`, background: t.surface1, flexShrink: 0, position: 'relative' }}>
        <button className="sn-iconbtn" style={{ ...iconBtn, border: 'none', background: 'transparent' }} onClick={closeArticle} title="Volver"><IcBack s={20} /></button>
        <span style={{ flex: 1 }} />
        {selected && (
          <>
            <AudioPlayer t={t} article={selected} phone={phone} />
            <button className="sn-iconbtn" style={iconBtn} onClick={() => { setReadMenuOpen((v) => !v); }} title="Lectura"><IcType s={16} /></button>
            <button className="sn-iconbtn" style={{ ...iconBtn, color: selected.isStarred ? SN.brand.coral : t.textSecondary }} onClick={() => void toggleStar(selected.id, !selected.isStarred)} title="Guardar">
              {selected.isStarred ? <IcStarF s={17} /> : <IcStar s={17} />}
            </button>
            <a className="sn-iconbtn" style={{ ...iconBtn, textDecoration: 'none' }} href={selected.link} target="_blank" rel="noopener noreferrer" title="Abrir original"><IcExt s={16} /></a>
            <button className="sn-iconbtn" style={iconBtn} onClick={() => void toggleRead(selected.id, !selected.isRead)} title={selected.isRead ? 'Marcar no leído' : 'Marcar leído'}>
              <IcCheck s={16} />
            </button>
          </>
        )}
        {readingMenu}
      </div>
      <article ref={articlePaneRef} className="scroll-y" onScroll={onArticleScroll} style={{ flex: 1, minHeight: 0 }}>
        {progressBar}
        {articleBody}
      </article>
    </div>
  );

  // FAB + bottom sheet de filtros (una mano, móvil)
  const fab = phone && !selectedId && (
    <button onClick={() => setSheetOpen(true)} title="Filtros y carpetas"
      style={{ position: 'fixed', right: 16, bottom: 'calc(20px + env(safe-area-inset-bottom))', zIndex: 25, width: 54, height: 54, borderRadius: '50%', border: 'none', background: SN.brand.blue, color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}>
      <IcFilter s={22} />
      {filtersActive && <span style={{ position: 'absolute', top: 4, right: 4, width: 11, height: 11, borderRadius: '50%', background: SN.brand.coral, border: `2px solid ${SN.brand.blue}` }} />}
    </button>
  );

  const sheet = phone && sheetOpen && (
    <div onClick={() => setSheetOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} className="scroll-y"
        style={{ background: t.bg, borderTop: `1px solid ${t.border}`, borderRadius: '16px 16px 0 0', padding: '10px 16px calc(20px + env(safe-area-inset-bottom))', maxHeight: '78dvh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: t.border, margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 15, color: t.textPrimary }}>Vistas y carpetas</span>
          {unreadToggle}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>{chipsRow}</div>

        <div style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 15, color: t.textPrimary, marginBottom: 8 }}>Buscar</div>
        {searchBox}

        <div style={{ fontFamily: SN.font.title, fontWeight: 700, fontSize: 15, color: t.textPrimary, margin: '14px 0 8px' }}>Ruido</div>
        {mutesRow}
        {hiddenByMutes > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: t.textMuted }}>{hiddenByMutes} {hiddenByMutes === 1 ? 'artículo oculto' : 'artículos ocultos'} por filtros de ruido</div>
        )}

        <button className="sn-iconbtn" style={{ ...ghostBtn, width: '100%', justifyContent: 'center', marginTop: 18 }} onClick={() => { void markAllRead(); setSheetOpen(false); }}>
          <IcCheck s={15} /> Marcar todo leído
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes sn-spin{to{transform:rotate(360deg)}}
        @keyframes sn-slide{0%{margin-left:-35%}50%{margin-left:100%}100%{margin-left:-35%}}
        .sn-input::placeholder{color:${t.textMuted};opacity:1;font-family:${SN.font.body};font-size:14px;}
        .sn-hover:hover{background:var(--hover)!important;}
        .sn-iconbtn:hover{background:var(--surf3)!important;color:${t.textPrimary}!important;}
        .sn-chip-x{display:grid;place-items:center;cursor:pointer;opacity:.65;}
        .sn-chip-x:hover{opacity:1;}
        .scroll-y{overflow-y:auto;-webkit-overflow-scrolling:touch;}
        .scroll-y::-webkit-scrollbar{width:8px;}
        .scroll-y::-webkit-scrollbar-thumb{background:var(--sb);border-radius:8px;}
        .scroll-y::-webkit-scrollbar-track{background:transparent;}
        .sn-chips::-webkit-scrollbar{display:none;}
        .sn-content{line-height:1.7;color:${t.textSecondary};overflow-wrap:break-word;}
        .sn-content p{margin:0 0 18px;}
        .sn-content img{max-width:100%;height:auto;border-radius:${SN.radius.lg}px;margin:8px 0;}
        .sn-content figure{margin:16px 0;}
        .sn-content figcaption{font-size:13px;color:${t.textTertiary};margin-top:6px;}
        .sn-content a{color:${t.isDark ? SN.blue[300] : SN.blue[600]};text-decoration:none;border-bottom:1px solid ${t.border};}
        .sn-content a:hover{border-bottom-color:${t.isDark ? SN.blue[300] : SN.blue[600]};}
        .sn-content pre{background:${t.surface2};border:1px solid ${t.borderSubtle};border-radius:${SN.radius.lg}px;padding:14px;overflow-x:auto;font-size:13.5px;line-height:1.55;font-family:${SN.font.mono};}
        .sn-content code{font-family:${SN.font.mono};font-size:0.88em;background:${t.surface2};padding:1px 5px;border-radius:4px;}
        .sn-content pre code{background:transparent;padding:0;}
        .sn-content blockquote{margin:16px 0;padding:4px 16px;border-left:3px solid ${SN.brand.teal};color:${t.textTertiary};}
        .sn-content h1,.sn-content h2,.sn-content h3,.sn-content h4{font-family:${SN.font.title};color:${t.textPrimary};line-height:1.3;margin:26px 0 12px;}
        .sn-content h1{font-size:1.3em}.sn-content h2{font-size:1.15em}.sn-content h3{font-size:1.05em}.sn-content h4{font-size:1em}
        .sn-content ul,.sn-content ol{margin:0 0 18px;padding-left:24px;}
        .sn-content li{margin-bottom:6px;}
        .sn-content table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;display:block;overflow-x:auto;}
        .sn-content th,.sn-content td{border:1px solid ${t.border};padding:6px 10px;text-align:left;}
        .sn-content hr{border:none;border-top:1px solid ${t.border};margin:24px 0;}
      `}</style>

      <div style={{ '--hover': t.hover, '--surf3': t.surface3, '--sb': t.sb, fontFamily: SN.font.body, background: t.appBg, height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' } as CSSProperties}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bg, minHeight: 0 }}>
          {header}
          {chips}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {sidebar}
            {listPane}
            {!phone && (
              <article ref={articlePaneRef} className="scroll-y" onScroll={onArticleScroll} style={{ flex: 1, minWidth: 0, background: t.bg }}>
                {progressBar}
                {articleBody}
              </article>
            )}
          </div>
        </div>
      </div>

      {fab}
      {sheet}
      {articleOverlay}

      {backToast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 'calc(28px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 60, background: t.textPrimary, color: t.bg, padding: '10px 18px', borderRadius: SN.radius.full, fontFamily: SN.font.body, fontSize: 13.5, fontWeight: 600, boxShadow: SN.shadow.lg, whiteSpace: 'nowrap' }}>
          Presiona atrás de nuevo para salir
        </div>
      )}

      {showSettings && (
        <SettingsModal
          t={t}
          phone={phone}
          folders={folders}
          feeds={feeds}
          gestures={gestures}
          onGestures={updateGestures}
          canInstall={!!installPrompt}
          onInstall={doInstall}
          onDiscover={() => setShowDiscover(true)}
          onClose={() => setShowSettings(false)}
          onChanged={() => {
            void refreshFeeds();
            void refreshFolders();
            void loadList(true);
          }}
        />
      )}

      {selectedId && <SelectionTranslator t={t} phone={phone} containerRef={articlePaneRef} />}

      {showConsole && <LiveConsole t={t} phone={phone} onClose={() => setShowConsole(false)} />}
      {showChat && <ChatSheet t={t} phone={phone} onClose={() => setShowChat(false)} />}

      {showDiscover && (
        <DiscoverModal
          t={t}
          phone={phone}
          folders={folders}
          onClose={() => setShowDiscover(false)}
          onChanged={() => {
            void refreshFeeds();
            void refreshFolders();
            void loadList(true);
          }}
        />
      )}
    </>
  );
}
