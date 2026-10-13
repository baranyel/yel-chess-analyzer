export type Platform = 'lichess' | 'chesscom';

export interface GameSummary {
  id: string;
  platform: Platform;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  result: string;
  date: string;
  timeControl?: string;
  pgn: string;
}

interface CacheEntry {
  games: GameSummary[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat
const STORAGE_PREFIX = 'yelSatranc_account_v2_';
const LEGACY_STORAGE_PREFIX = 'yelSatranc_account_v1_';
const USERNAME_KEY = 'yelSatranc_accountUsernames_v1';

// Only standard-rules time controls; variants (Chess960, Atomic…) cannot be analysed.
const LICHESS_PERF_TYPES = 'ultraBullet,bullet,blitz,rapid,classical,correspondence';

// ── Username persistence ──────────────────────────────────────────────────

export function loadSavedUsernames(): Partial<Record<Platform, string>> {
  try {
    return JSON.parse(localStorage.getItem(USERNAME_KEY) ?? '{}');
  } catch { return {}; }
}

export function saveUsername(platform: Platform, username: string): void {
  const all = loadSavedUsernames();
  all[platform] = username;
  try { localStorage.setItem(USERNAME_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

// ── Cache helpers ─────────────────────────────────────────────────────────

function cacheKey(platform: Platform, username: string, count: number) {
  return `${STORAGE_PREFIX}${platform}_${username.toLowerCase()}_${count}`;
}

/** The v1 cache ignored the game count and is never read again — free its space. */
function removeLegacyCache(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_STORAGE_PREFIX)) stale.push(key);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

function readCache(platform: Platform, username: string, count: number): GameSummary[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(platform, username, count));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.games;
  } catch { return null; }
}

function writeCache(platform: Platform, username: string, count: number, games: GameSummary[]): void {
  try {
    const entry: CacheEntry = { games, fetchedAt: Date.now() };
    localStorage.setItem(cacheKey(platform, username, count), JSON.stringify(entry));
  } catch { /* storage full — skip caching */ }
}

// ── Time control label ────────────────────────────────────────────────────

const SPEED_LABELS: Record<string, string> = {
  ultraBullet: 'Bullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Klasik',
  correspondence: 'Yazışmalı',
  daily: 'Günlük',
};

/** Lichess `speed` / Chess.com `time_class` → label. */
export function speedLabel(speed?: string): string | undefined {
  return speed ? SPEED_LABELS[speed] : undefined;
}

/** Fallback for a Chess.com `time_control` string ("600", "180+2", "1/86400"). */
export function chesscomTimeControlLabel(tc?: string): string | undefined {
  if (!tc) return undefined;
  if (tc.includes('/')) return 'Günlük'; // "1/86400" = 1 move per day
  const secs = parseInt(tc.split('+')[0] ?? '0', 10);
  if (!Number.isFinite(secs)) return undefined;
  const mins = secs / 60;
  if (mins < 3)  return 'Bullet';
  if (mins < 10) return 'Blitz';
  if (mins < 30) return 'Rapid';
  return 'Klasik';
}

// ── Raw API shapes → GameSummary (pure, unit-tested) ─────────────────────

export interface LichessRawGame {
  id?: string;
  variant?: string;
  speed?: string;
  createdAt?: number;
  winner?: 'white' | 'black';
  pgn?: string;
  players?: {
    white?: { user?: { name?: string }; rating?: number };
    black?: { user?: { name?: string }; rating?: number };
  };
}

export function mapLichessGame(g: LichessRawGame): GameSummary | null {
  if (!g.pgn) return null;
  if (g.variant && g.variant !== 'standard' && g.variant !== 'fromPosition') return null;
  const date = g.createdAt
    ? new Date(g.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '?';
  return {
    id:          g.id ?? '',
    platform:    'lichess',
    white:       g.players?.white?.user?.name ?? 'Beyaz',
    black:       g.players?.black?.user?.name ?? 'Siyah',
    whiteElo:    g.players?.white?.rating,
    blackElo:    g.players?.black?.rating,
    result:      g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
    date,
    timeControl: speedLabel(g.speed),
    pgn:         g.pgn,
  };
}

export interface ChessComRawGame {
  uuid?: string;
  url?: string;
  pgn?: string;
  rules?: string;
  time_class?: string;
  time_control?: string;
  end_time?: number;
  white: { username: string; rating?: number; result?: string };
  black: { username: string; rating?: number; result?: string };
}

export function mapChessComGame(g: ChessComRawGame): GameSummary | null {
  if (!g.pgn) return null;
  if (g.rules && g.rules !== 'chess') return null; // chess960, bughouse, …
  const whiteWon = g.white.result === 'win';
  const blackWon = g.black.result === 'win';
  const date = g.end_time
    ? new Date(g.end_time * 1000).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '?';
  return {
    id:          g.uuid ?? g.url ?? '',
    platform:    'chesscom',
    white:       g.white.username,
    black:       g.black.username,
    whiteElo:    g.white.rating,
    blackElo:    g.black.rating,
    result:      whiteWon ? '1-0' : blackWon ? '0-1' : '½-½',
    date,
    timeControl: speedLabel(g.time_class) ?? chesscomTimeControlLabel(g.time_control),
    pgn:         g.pgn,
  };
}

// ── Lichess ───────────────────────────────────────────────────────────────

/** `force` skips the 1-hour cache (the "Yenile" button). */
export async function fetchLichessGames(username: string, max = 15, force = false): Promise<GameSummary[]> {
  removeLegacyCache();
  if (!force) {
    const cached = readCache('lichess', username, max);
    if (cached) return cached;
  }

  const url =
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}` +
    `?max=${max}&perfType=${LICHESS_PERF_TYPES}&pgnInJson=true&clocks=false&opening=false`;
  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });

  if (res.status === 404) throw new Error('Kullanıcı bulunamadı.');
  if (res.status === 429) throw new Error('Çok fazla istek gönderildi, lütfen bekleyin.');
  if (!res.ok) throw new Error(`Lichess hatası: ${res.status}`);

  const text = await res.text();
  const games = text.split('\n').filter(Boolean).flatMap((line): GameSummary[] => {
    try {
      const mapped = mapLichessGame(JSON.parse(line));
      return mapped ? [mapped] : [];
    } catch { return []; }
  });

  writeCache('lichess', username, max, games);
  return games;
}

// ── Chess.com ─────────────────────────────────────────────────────────────

export async function fetchChessComGames(username: string, count = 15, force = false): Promise<GameSummary[]> {
  removeLegacyCache();
  if (!force) {
    const cached = readCache('chesscom', username, count);
    if (cached) return cached;
  }

  // No custom headers: a non-safelisted header (like User-Agent) would force a
  // CORS preflight, and browsers set their own User-Agent anyway.

  // Step 1: get archive list
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
  );
  if (archivesRes.status === 404) throw new Error('Kullanıcı bulunamadı.');
  if (archivesRes.status === 429) throw new Error('Çok fazla istek gönderildi, lütfen bekleyin.');
  if (!archivesRes.ok) throw new Error(`Chess.com hatası: ${archivesRes.status}`);

  const { archives } = await archivesRes.json() as { archives: string[] };
  if (!archives?.length) return [];

  // Fetch latest month(s) until we have enough games
  const games: GameSummary[] = [];
  for (let i = archives.length - 1; i >= 0 && games.length < count; i--) {
    const monthRes = await fetch(archives[i]!);
    if (!monthRes.ok) continue;

    const { games: monthGames } = await monthRes.json() as { games: ChessComRawGame[] };

    const mapped = [...(monthGames ?? [])].reverse().flatMap((g): GameSummary[] => {
      const m = mapChessComGame(g);
      return m ? [m] : [];
    });

    games.push(...mapped);
  }

  const trimmed = games.slice(0, count);
  writeCache('chesscom', username, count, trimmed);
  return trimmed;
}
