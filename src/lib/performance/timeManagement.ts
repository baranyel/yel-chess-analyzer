import { cpToWinPct } from '../classification';
import type { TimeControl } from '../pgn';
import calibration from './calibration.json';
import type { MoveFeature } from './moves';

// Time-management score. It is NOT part of the rating estimate: in the
// calibration data these indicators track rating but barely explain accuracy or
// results once rating is known. So the score describes how a player uses the
// clock compared with players of similar rating (percentiles), nothing more.
//
// Indicator definitions match gameTimeFeatures() in scripts/calibrate/lib.mjs.

export type TimeIndicator = 'lowFrac' | 'lowBlunderGap' | 'fastBlunder' | 'allocation' | 'openingShare' | 'leftover';
type Indicators = Record<TimeIndicator, number>; // NaN = not measurable in this game

export interface GameTimeInput {
  /** The player's moves (all of them, not only scored ones). */
  features: MoveFeature[];
  /** Clock left after every ply of the game, seconds. */
  clocks: number[];
  timeControl: TimeControl;
  /** Ply index of the game's first move (non-zero for games set up from a FEN). */
  firstPly?: number;
}

const BLUNDER_WIN_LOSS = 10;
const FAST_SECONDS = 1;
const MIN_OWN_MOVES = 15;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function corr(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Indicators for one game, or null when the clock data does not cover it. */
export function gameTimeIndicators(g: GameTimeInput): Indicators | null {
  const { initial, increment } = g.timeControl;
  const first = g.firstPly ?? 0;
  const own = g.features.flatMap((m) => {
    const k = m.ply - first;
    const clockAfter = g.clocks[k];
    const clockBefore = k >= 2 ? g.clocks[k - 2] : initial;
    if (clockAfter === undefined || clockBefore === undefined) return [];
    return [{ ...m, clockAfter, spent: Math.max(0, clockBefore + increment - clockAfter) }];
  });
  if (own.length < MIN_OWN_MOVES) return null;

  const lowLimit = Math.max(10, 0.1 * initial);
  const low = own.filter((m) => m.clockAfter < lowLimit);
  const normal = own.filter((m) => m.clockAfter >= lowLimit && m.ply >= 10 && !m.forced);
  const scored = own.filter((m) => m.ply >= 10 && !m.forced);
  const blunder = (m: MoveFeature) => (m.winLoss > BLUNDER_WIN_LOSS ? 1 : 0);

  const crit = scored.map((m) => 1 - Math.abs(cpToWinPct(m.before) - 50) / 50);
  const logT = scored.map((m) => Math.log(1 + m.spent));
  const total = own.reduce((s, m) => s + m.spent, 0) || 1;
  const opening = own.filter((m) => m.ply < 20).reduce((s, m) => s + m.spent, 0);
  const fast = scored.filter((m) => m.spent < FAST_SECONDS);

  return {
    lowFrac: low.length / own.length,
    lowBlunderGap: low.length >= 3 && normal.length >= 5 ? mean(low.map(blunder)) - mean(normal.map(blunder)) : NaN,
    fastBlunder: fast.length >= 3 ? mean(fast.map(blunder)) : NaN,
    allocation: scored.length >= 10 ? corr(crit, logT) : NaN,
    openingShare: opening / total,
    leftover: Math.min(1, own[own.length - 1]!.clockAfter / (initial + 40 * increment || 1)),
  };
}

interface IndicatorMeta {
  label: string;
  better: 'low' | 'high';
  format: (v: number) => string;
  hint: string;
}

const pct = (v: number) => `%${Math.round(v * 100)}`;

export const TIME_INDICATORS: Record<TimeIndicator, IndicatorMeta> = {
  lowFrac: {
    label: 'Zaman sıkışması', better: 'low', format: pct,
    hint: 'Saatin %10\'undan (en az 10 sn) az süreyle oynanan hamlelerin payı',
  },
  lowBlunderGap: {
    label: 'Baskı altında hata artışı', better: 'low',
    format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))} puan`,
    hint: 'Sıkışık sürede gaf/yanılgı oranı ile normal süredeki oranın farkı',
  },
  fastBlunder: {
    label: 'Hızlı hamlede hata', better: 'low', format: pct,
    hint: '1 saniyeden kısa sürede oynanan hamlelerin gaf/yanılgı oranı',
  },
  allocation: {
    label: 'Kritik anlara zaman', better: 'high', format: (v) => v.toFixed(2),
    hint: 'Dengeli (kritik) pozisyonlarda daha uzun düşünme eğilimi (korelasyon, −1…+1)',
  },
  openingShare: {
    label: 'Açılışa harcanan süre', better: 'low', format: pct,
    hint: 'İlk 10 hamleye harcanan sürenin toplam süreye oranı',
  },
  leftover: {
    label: 'Kullanılmayan süre', better: 'low', format: pct,
    hint: 'Oyun bittiğinde saatte kalan süre (başlangıç + 40 × artış oranına göre)',
  },
};

export interface TimeComponent {
  key: TimeIndicator;
  value: number;
  /** Where the value sits among similar-rated players (0–100). */
  percentile: number;
  /** Percentile flipped so that higher is always better (0–100). */
  goodness: number;
}

export interface TimeManagementResult {
  /** Mean goodness of the measurable indicators (0–100). */
  score: number;
  games: number;
  components: TimeComponent[];
  /** Rating band of the reference players, e.g. "1200–1600". */
  band: string;
  /** Norms are per-player means over ~15 games; few games give a rough score. */
  reliable: boolean;
}

/** Percentile of `v` in a 21-point quantile table (0, 5, …, 100 %). */
function percentileOf(quantiles: number[], v: number): number {
  if (v <= quantiles[0]!) return 0;
  const last = quantiles.length - 1;
  if (v >= quantiles[last]!) return 100;
  for (let i = 1; i <= last; i++) {
    const hi = quantiles[i]!, lo = quantiles[i - 1]!;
    if (v <= hi) {
      const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      return ((i - 1 + t) / last) * 100;
    }
  }
  return 100;
}

/**
 * Time-management score over the games that have clock data.
 * `referenceRating` picks the comparison band; it must be on the Lichess scale,
 * because the norms come from Lichess players.
 */
export function timeManagement(games: GameTimeInput[], referenceRating: number | null): TimeManagementResult | null {
  const per = games.map(gameTimeIndicators).filter((x): x is Indicators => x !== null);
  if (per.length === 0) return null;

  const bands = calibration.time.bands;
  const r = referenceRating ?? 1400;
  const band = bands.find((b) => r >= b.lo && r < b.hi) ?? bands[bands.length - 1]!;

  const components: TimeComponent[] = [];
  for (const key of Object.keys(TIME_INDICATORS) as TimeIndicator[]) {
    const vals = per.map((p) => p[key]).filter((v) => !Number.isNaN(v));
    if (vals.length === 0) continue;
    const value = mean(vals);
    const percentile = percentileOf(band.quantiles[key], value);
    const goodness = TIME_INDICATORS[key].better === 'high' ? percentile : 100 - percentile;
    components.push({ key, value, percentile: Math.round(percentile), goodness: Math.round(goodness) });
  }
  if (components.length === 0) return null;

  return {
    score: Math.round(mean(components.map((c) => c.goodness))),
    games: per.length,
    components,
    band: band.lo === 0 ? `<${band.hi}` : band.hi >= 4000 ? `${band.lo}+` : `${band.lo}–${band.hi}`,
    reliable: per.length >= 5,
  };
}
