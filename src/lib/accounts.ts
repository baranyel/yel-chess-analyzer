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
const STORAGE_PREFIX = 'yelSatranc_account_v1_';
const USERNAME_KEY = 'yelSatranc_accountUsernames_v1';

// ── Username persistence ──────────────────────────────────────────────────

export function loadSavedUsernames(): Record<Platform, string> {
  try {
    return JSON.parse(localStorage.getItem(USERNAME_KEY) ?? '{}');
  } catch { return {} as Record<Platform, string>; }
}

export function saveUsername(platform: Platform, username: string): void {
  const all = loadSavedUsernames();
  all[platform] = username;
  try { localStorage.setItem(USERNAME_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

// ── Cache helpers ─────────────────────────────────────────────────────────

function cacheKey(platform: Platform, username: string) {
  return STORAGE_PREFIX + platform + '_' + username.toLowerCase();
}

function readCache(platform: Platform, username: string): GameSummary[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(platform, username));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.games;
  } catch { return null; }
}

function writeCache(platform: Platform, username: string, games: GameSummary[]): void {
  try {
    const entry: CacheEntry = { games, fetchedAt: Date.now() };
    localStorage.setItem(cacheKey(platform, username), JSON.stringify(entry));
  } catch { /* storage full — skip caching */ }
}

// ── Time control label ────────────────────────────────────────────────────

function lichessTimeLabel(clock?: { initial: number; increment: number }): string | undefined {
  if (!clock) return undefined;
  const mins = Math.floor(clock.initial / 60);
  const inc  = clock.increment;
  if (mins + inc <= 2)  return 'Bullet';
  if (mins + inc <= 5)  return 'Blitz';
  if (mins + inc <= 15) return 'Rapid';
  return 'Klasik';
}

function chesscomTimeLabel(tc?: string): string | undefined {
  if (!tc) return undefined;
  const secs = parseInt(tc.split('+')[0] ?? '0', 10);
  const mins = secs / 60;
  if (mins < 3)  return 'Bullet';
  if (mins < 10) return 'Blitz';
  if (mins < 30) return 'Rapid';
  return 'Klasik';
}

// ── Lichess ───────────────────────────────────────────────────────────────

export async function fetchLichessGames(username: string, max = 15): Promise<GameSummary[]> {
  const cached = readCache('lichess', username);
  if (cached) return cached;

  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&pgnInJson=true&clocks=false&opening=false`;
  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });

  if (res.status === 404) throw new Error('Kullanıcı bulunamadı.');
  if (res.status === 429) throw new Error('Çok fazla istek gönderildi, lütfen bekleyin.');
  if (!res.ok) throw new Error(`Lichess hatası: ${res.status}`);

  const text = await res.text();
  const games = text.split('\n').filter(Boolean).flatMap((line): GameSummary[] => {
    try {
      const g = JSON.parse(line);
      if (!g.pgn) return [];
      const date = g.createdAt
        ? new Date(g.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
        : '?';
      return [{
        id:          g.id ?? '',
        platform:    'lichess',
        white:       g.players?.white?.user?.name ?? 'Beyaz',
        black:       g.players?.black?.user?.name ?? 'Siyah',
        whiteElo:    g.players?.white?.rating,
        blackElo:    g.players?.black?.rating,
        result:      g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
        date,
        timeControl: lichessTimeLabel(g.clock),
        pgn:         g.pgn,
      }];
    } catch { return []; }
  });

  writeCache('lichess', username, games);
  return games;
}

// ── Chess.com ─────────────────────────────────────────────────────────────

export async function fetchChessComGames(username: string, count = 15): Promise<GameSummary[]> {
  const cached = readCache('chesscom', username);
  if (cached) return cached;

  const headers = { 'User-Agent': 'yel-chess-analyzer/1.0' };

  // Step 1: get archive list
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
    { headers },
  );
  if (archivesRes.status === 404) throw new Error('Kullanıcı bulunamadı.');
  if (archivesRes.status === 429) throw new Error('Çok fazla istek gönderildi, lütfen bekleyin.');
  if (!archivesRes.ok) throw new Error(`Chess.com hatası: ${archivesRes.status}`);

  const { archives } = await archivesRes.json() as { archives: string[] };
  if (!archives?.length) return [];

  // Fetch latest month(s) until we have enough games
  const games: GameSummary[] = [];
  for (let i = archives.length - 1; i >= 0 && games.length < count; i--) {
    const monthRes = await fetch(archives[i]!, { headers });
    if (!monthRes.ok) continue;

    const { games: monthGames } = await monthRes.json() as {
      games: Array<{
        uuid?: string; url?: string; pgn?: string;
        white: { username: string; rating?: number; result?: string };
        black: { username: string; rating?: number; result?: string };
        end_time?: number; time_control?: string;
      }>;
    };

    const mapped: GameSummary[] = [...(monthGames ?? [])].reverse().flatMap((g): GameSummary[] => {
      if (!g.pgn) return [];
      const whiteWon = g.white.result === 'win';
      const blackWon = g.black.result === 'win';
      const date = g.end_time
        ? new Date(g.end_time * 1000).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
        : '?';
      return [{
        id:          g.uuid ?? g.url ?? '',
        platform:    'chesscom',
        white:       g.white.username,
        black:       g.black.username,
        whiteElo:    g.white.rating,
        blackElo:    g.black.rating,
        result:      whiteWon ? '1-0' : blackWon ? '0-1' : '½-½',
        date,
        timeControl: chesscomTimeLabel(g.time_control),
        pgn:         g.pgn,
      }];
    });

    games.push(...mapped);
  }

  const trimmed = games.slice(0, count);
  writeCache('chesscom', username, trimmed);
  return trimmed;
}
