// Cliente de la API REST de Señal (§ 3.1 del spec)

export interface ArticleListItem {
  id: string;
  source: string;
  folderKey: string;
  dotColor: string;
  title: string;
  excerpt: string;
  tldr: string | null;
  imageUrl: string | null;
  publishedAt: string;
  isRead: boolean;
  isStarred: boolean;
  readingMinutes: number | null;
}

export interface DigestItem extends ArticleListItem {
  score: number;
}

export interface ArticleDetail extends ArticleListItem {
  link: string;
  author: string | null;
  fullContent: string;
  contentStatus: 'full' | 'partial';
  tldrStatus: 'pending' | 'done' | 'failed' | 'skipped';
}

export interface Folder {
  key: string;
  label: string;
  unreadCount: number;
}

export interface FeedInfo {
  id: string;
  url: string;
  title: string;
  siteUrl: string | null;
  folderKey: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastFetchStatus: string | null;
  lastError: string | null;
}

export interface FeedAffinity {
  feedId: string;
  score: number;
  sampleSize: number;
  recentPerWeek: number;
}

export type TtsEngine = 'piper' | 'kokoro';

export interface TtsStatus {
  status: 'none' | 'generating' | 'ready' | 'failed';
  error?: string;
  format?: 'mp3' | 'wav';
  startedAt?: string;
  tookMs?: number;
}

export interface VoiceOption {
  id: string;
  label: string;
}

export interface DdgResult {
  heading: string | null;
  abstract: string | null;
  source: string | null;
  url: string | null;
  answer: string | null;
  definition: string | null;
  related: { text: string; url: string }[];
}

export interface WikiResult {
  found: boolean;
  lang?: string;
  title?: string;
  extract?: string;
  thumbnail?: string | null;
  url?: string;
  others?: { title: string; url: string }[];
}

export type ThemeKey = 'light' | 'sepia' | 'cafe' | 'dark' | 'black';

export interface SuggestedItem {
  title: string;
  url: string;
  folderLabel: string;
  note: string;
  added: boolean;
}

export interface AnalyzeResult {
  score: number;
  matched: string[];
  sampleTitles: string[];
  verdict: string | null;
  aiEnabled: boolean;
}

export interface ArticlesPage {
  items: ArticleListItem[];
  nextCursor: string | null;
  hiddenByMutes: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface ListParams {
  folder?: string;
  unreadOnly?: boolean;
  saved?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}

export const api = {
  listArticles(params: ListParams): Promise<ArticlesPage> {
    const q = new URLSearchParams();
    if (params.folder && params.folder !== 'all') q.set('folder', params.folder);
    if (params.unreadOnly) q.set('unreadOnly', 'true');
    if (params.saved) q.set('saved', 'true');
    if (params.search?.trim()) q.set('search', params.search.trim());
    if (params.cursor) q.set('cursor', params.cursor);
    q.set('limit', String(params.limit ?? 30));
    return request(`/api/articles?${q}`);
  },
  articleDetail(id: string): Promise<ArticleDetail> {
    return request(`/api/articles/${id}`);
  },
  setRead(id: string, read: boolean): Promise<{ ok: true }> {
    return request(`/api/articles/${id}/read`, { method: 'PATCH', body: JSON.stringify({ read }) });
  },
  setStar(id: string, starred: boolean): Promise<{ ok: true }> {
    return request(`/api/articles/${id}/star`, { method: 'PATCH', body: JSON.stringify({ starred }) });
  },
  markAllRead(folder?: string): Promise<{ updated: number }> {
    return request('/api/articles/mark-all-read', {
      method: 'POST',
      body: JSON.stringify(folder && folder !== 'all' ? { folder } : {}),
    });
  },
  folders(): Promise<Folder[]> {
    return request('/api/folders');
  },
  mutes(): Promise<string[]> {
    return request('/api/mutes');
  },
  addMute(term: string): Promise<string[]> {
    return request('/api/mutes', { method: 'POST', body: JSON.stringify({ term }) });
  },
  removeMute(term: string): Promise<string[]> {
    return request(`/api/mutes/${encodeURIComponent(term)}`, { method: 'DELETE' });
  },
  getPrefs(): Promise<{ theme: ThemeKey; interests: string[] }> {
    return request('/api/prefs');
  },
  setTheme(theme: ThemeKey): Promise<{ theme: ThemeKey }> {
    return request('/api/prefs', { method: 'PATCH', body: JSON.stringify({ theme }) });
  },
  setInterests(interests: string[]): Promise<{ theme: ThemeKey; interests: string[] }> {
    return request('/api/prefs', { method: 'PATCH', body: JSON.stringify({ interests }) });
  },
  digest(hours = 24): Promise<{ items: DigestItem[]; interests: string[] }> {
    return request(`/api/digest?hours=${hours}`);
  },
  aiInfo(): Promise<{ provider: string; model: string; enabled: boolean; systemPrompt: string }> {
    return request('/api/ai/info');
  },
  translate(text: string): Promise<{ translation: string }> {
    return request('/api/ai/translate', { method: 'POST', body: JSON.stringify({ text }) });
  },
  ttsVoices(): Promise<{ piper: VoiceOption[]; kokoro: VoiceOption[] }> {
    return request('/api/tts/voices');
  },
  ttsStart(id: string, engine: TtsEngine, voice?: string): Promise<TtsStatus> {
    return request(`/api/tts/${id}?engine=${engine}${voice ? `&voice=${encodeURIComponent(voice)}` : ''}`, { method: 'POST' });
  },
  ttsStatus(id: string, engine: TtsEngine, voice?: string): Promise<TtsStatus> {
    return request(`/api/tts/${id}/status?engine=${engine}${voice ? `&voice=${encodeURIComponent(voice)}` : ''}`);
  },
  searchDdg(q: string): Promise<DdgResult> {
    return request(`/api/search/ddg?q=${encodeURIComponent(q)}`);
  },
  searchWikipedia(q: string): Promise<WikiResult> {
    return request(`/api/search/wikipedia?q=${encodeURIComponent(q)}`);
  },
  suggestedFeeds(): Promise<{ groups: { folderLabel: string; feeds: SuggestedItem[] }[] }> {
    return request('/api/discover');
  },
  analyzeFeed(url: string): Promise<AnalyzeResult> {
    return request('/api/discover/analyze', { method: 'POST', body: JSON.stringify({ url }) });
  },
  importOpml(opml: string): Promise<{ folders: number; feeds: number; skipped: number }> {
    return request('/api/opml/import', { method: 'POST', body: JSON.stringify({ opml }) });
  },
  feeds(): Promise<FeedInfo[]> {
    return request('/api/feeds');
  },
  feedAffinities(): Promise<FeedAffinity[]> {
    return request('/api/feeds/affinity');
  },
  createFeed(url: string, folderKey: string): Promise<FeedInfo> {
    return request('/api/feeds', { method: 'POST', body: JSON.stringify({ url, folderKey }) });
  },
  deleteFeed(id: string): Promise<{ ok: true }> {
    return request(`/api/feeds/${id}`, { method: 'DELETE' });
  },
  createFolder(label: string): Promise<Folder> {
    return request('/api/folders', { method: 'POST', body: JSON.stringify({ label }) });
  },
  deleteFolder(key: string): Promise<{ ok: true }> {
    return request(`/api/folders/${key}`, { method: 'DELETE' });
  },
  ingest(): Promise<{ feedsFetched: number; newArticles: number; summarized: number; errors: number }> {
    return request('/api/ingest', { method: 'POST' });
  },
};

/** "hace 2 h", "ayer", "12 mar" — tiempo relativo corto en español. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
