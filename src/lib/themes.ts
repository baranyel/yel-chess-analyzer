// ── Site Themes ───────────────────────────────────────────────────────────

export type ThemeId = 'soft-dark' | 'dark' | 'light' | 'soft-light';

export interface SiteTheme {
  id: ThemeId;
  name: string;
  hint: string;
}

export const SITE_THEMES: SiteTheme[] = [
  { id: 'soft-dark',  name: 'Soft Karanlık', hint: 'Göz dostu koyu'   },
  { id: 'dark',       name: 'Tam Karanlık',  hint: 'Zifiri siyah'     },
  { id: 'light',      name: 'Beyaz',         hint: 'Standart açık'    },
  { id: 'soft-light', name: 'Soft Beyaz',    hint: 'Göz dostu açık'   },
];

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
  { id: 'cburnett',   name: 'CBurnett',   description: 'Lichess klasik seti',         path: '/pieces/cburnett' },
  { id: 'merida',     name: 'Merida',     description: 'Turnuva standart seti',       path: '/pieces/merida' },
  { id: 'alpha',      name: 'Alpha',      description: 'Sade, temiz tasarım',         path: '/pieces/alpha' },
  { id: 'california', name: 'California', description: 'Modern zarif seti',           path: '/pieces/california' },
];

// ── Font Options ──────────────────────────────────────────────────────────

export interface FontOption {
  id: string;
  name: string;
  stack: string;
  preview: string;
  googleFont?: string;  // Google Fonts family+weight param
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'system',
    name: 'Sistem',
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    preview: 'Abc 123',
  },
  {
    id: 'inter',
    name: 'Inter',
    stack: "'Inter', sans-serif",
    preview: 'Abc 123',
    googleFont: 'Inter:wght@400;500;600;700',
  },
  {
    id: 'nunito',
    name: 'Nunito',
    stack: "'Nunito', sans-serif",
    preview: 'Abc 123',
    googleFont: 'Nunito:wght@400;500;600;700',
  },
  {
    id: 'fira',
    name: 'Fira Code',
    stack: "'Fira Code', monospace",
    preview: 'Abc 123',
    googleFont: 'Fira+Code:wght@400;500;600;700',
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
  theme: 'soft-dark',
  boardColorId: 'classic',
  pieceSetId: 'default',
  boardSize: 100,
  fontId: 'system',
};

const STORAGE_KEY = 'yelSatranc_prefs_v1';

export function loadPrefs(): AppPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(prefs: AppPrefs): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
