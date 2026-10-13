// ── Site Themes ───────────────────────────────────────────────────────────

export type ThemeId = 'bliss' | 'gece';

export interface SiteTheme {
  id: ThemeId;
  name: string;
  hint: string;
}

export const SITE_THEMES: SiteTheme[] = [
  { id: 'bliss', name: 'Bliss', hint: 'Gündüz, mavi gökyüzü' },
  { id: 'gece',  name: 'Gece',  hint: 'Koyu, göz yormaz'     },
];

/** Maps any stored theme id (including the four pre-redesign ones) to a current one. */
export function normalizeTheme(id: unknown): ThemeId {
  if (id === 'bliss' || id === 'gece') return id;
  if (id === 'soft-dark' || id === 'dark') return 'gece';
  return 'bliss'; // 'light', 'soft-light', unknown
}

// ── Board Colors ──────────────────────────────────────────────────────────

export interface BoardColor {
  id: string;
  name: string;
  dark: string;
  light: string;
}

export const BOARD_COLORS: BoardColor[] = [
  { id: 'classic',   name: 'Klasik Yeşil', dark: '#779952', light: '#edeed1' },
  { id: 'wood',      name: 'Ahşap',        dark: '#b58863', light: '#f0d9b5' },
  { id: 'ocean',     name: 'Okyanus',      dark: '#4a82b4', light: '#afd0ec' },
  { id: 'slate',     name: 'Arduvaz',      dark: '#3d5066', light: '#8da9c0' },
  { id: 'midnight',  name: 'Gece',         dark: '#2c3e50', light: '#607d8b' },
  { id: 'amethyst',  name: 'Ametist',      dark: '#7b5ea7', light: '#d4b8f0' },
  { id: 'maple',     name: 'Akçaağaç',     dark: '#c05a1f', light: '#f0c070' },
  { id: 'mono',      name: 'Mono',         dark: '#4a4a4a', light: '#c0c0c0' },
];

// ── Piece Sets ────────────────────────────────────────────────────────────

export interface PieceSet {
  id: string;
  name: string;
  description: string;
  path: string | null;  // null = react-chessboard default
}

export const PIECE_SETS: PieceSet[] = [
  { id: 'default',    name: 'Standart',   description: 'Varsayılan modern set',       path: null },
  { id: 'cburnett',   name: 'CBurnett',   description: 'Lichess klasik seti',         path: 'pieces/cburnett' },
  { id: 'merida',     name: 'Merida',     description: 'Turnuva standart seti',       path: 'pieces/merida' },
  { id: 'alpha',      name: 'Alpha',      description: 'Sade, temiz tasarım',         path: 'pieces/alpha' },
  { id: 'california', name: 'California', description: 'Modern zarif seti',           path: 'pieces/california' },
];

// ── Font Options ──────────────────────────────────────────────────────────

export interface FontOption {
  id: string;
  name: string;
  stack: string;
  preview: string;
  /**
   * Loads the font's CSS (and its woff2 files) the first time the font is picked.
   * The fonts are bundled with the site (@fontsource-variable, latin + latin-ext
   * so Turkish letters work) — nothing is fetched from Google.
   */
  load?: () => Promise<unknown>;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'system',
    name: 'Tahoma (XP)',
    stack: "Tahoma, Verdana, 'Segoe UI', system-ui, sans-serif",
    preview: 'Abc 123',
  },
  {
    id: 'inter',
    name: 'Inter',
    stack: "'Inter Variable', system-ui, sans-serif",
    preview: 'Abc 123',
    load: () => import('@fontsource-variable/inter/index.css'),
  },
  {
    id: 'nunito',
    name: 'Nunito',
    stack: "'Nunito Variable', system-ui, sans-serif",
    preview: 'Abc 123',
    load: () => import('@fontsource-variable/nunito/index.css'),
  },
  {
    id: 'fira',
    name: 'Fira Code',
    stack: "'Fira Code Variable', ui-monospace, monospace",
    preview: 'Abc 123',
    load: () => import('@fontsource-variable/fira-code/index.css'),
  },
];

// ── User Preferences ──────────────────────────────────────────────────────

export interface AppPrefs {
  theme: ThemeId;
  boardColorId: string;
  pieceSetId: string;
  boardSize: number;  // 70–130 (percentage of base 520px)
  fontId: string;
}

export const DEFAULT_PREFS: AppPrefs = {
  theme: 'bliss',
  boardColorId: 'classic',
  pieceSetId: 'default',
  boardSize: 100,
  fontId: 'system',
};

const STORAGE_KEY = 'yelSatranc_prefs_v1';

export function loadPrefs(): AppPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      return { ...DEFAULT_PREFS, ...stored, theme: normalizeTheme(stored.theme) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(prefs: AppPrefs): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
