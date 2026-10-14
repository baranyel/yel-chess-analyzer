import type { Platform } from '../accounts';
import calibration from './calibration.json';
import { isScored, moveAccuracy, type MoveFeature } from './moves';
import {
  chesscomToLichess,
  conversionSlope,
  hasConversion,
  lichessToChesscom,
  scaleSpeed,
  type ScaleSpeed,
} from './scale';

// Rating estimates calibrated on rated Lichess games (scripts/calibrate/fit.mjs).
// Every estimate carries an 80 % interval whose width is the measured
// cross-validated error for that many games.

export type PerformanceMethod = 'combined' | 'accuracy' | 'acpl' | 'results';

/** z for a two-sided 80 % interval. */
const Z80 = 1.2816;
const MIN_SCORED_MOVES = 10;

export interface MethodEstimate {
  method: PerformanceMethod;
  rating: number;
  low: number;
  high: number;
  /** Measured error (RMSE) for this method and game count. */
  error: number;
  /** Rating pool the number belongs to. Accuracy models are calibrated on Lichess and
   *  converted to Chess.com when a conversion exists; results use the opponents' pool. */
  scale: Platform | 'unknown';
  /** The same rating on the other site's scale, when a conversion exists. */
  equivalent?: { scale: Platform; rating: number } | null;
}

/** What one game contributes: the player's moves, and the result if rated. */
export interface GameEvidence {
  features: MoveFeature[];
  opponentRating?: number | null;
  /** 1 win, 0.5 draw, 0 loss (player's POV). */
  score?: number | null;
  /** The player's own rating in that game. */
  playerRating?: number | null;
  /** Speed class of the game ('blitz', 'rapid', 'classical', …), picks the conversion table. */
  speed?: string | null;
}

export interface PerformanceEstimate {
  games: number;
  scoredMoves: number;
  platform: Platform | null;
  /** Mean of the player's own ratings in these games, when known. */
  playerRating: number | null;
  /** The same on the Lichess scale (converted for Chess.com), for Lichess-based norms. */
  playerRatingLichess: number | null;
  accuracy: MethodEstimate | null;
  acpl: MethodEstimate | null;
  results: MethodEstimate | null;
  /** Accuracy + results; only when both are on the same scale. */
  combined: MethodEstimate | null;
  /** Accuracy and results disagree by more than their joint 80 % error. */
  disagreement: boolean;
}

interface Point { games: number; [k: string]: number }

/** Linear interpolation in ln(games) over a calibration table; clamps at the ends. */
function interp(table: Point[], games: number, key: string): number {
  const g = Math.max(1, games);
  const first = table[0]!, last = table[table.length - 1]!;
  if (g <= first.games) return first[key]!;
  if (g >= last.games) return last[key]!;
  for (let i = 1; i < table.length; i++) {
    const hi = table[i]!, lo = table[i - 1]!;
    if (g <= hi.games) {
      const t = (Math.log(g) - Math.log(lo.games)) / (Math.log(hi.games) - Math.log(lo.games));
      return lo[key]! + t * (hi[key]! - lo[key]!);
    }
  }
  return last[key]!;
}

const clampRating = (r: number) => Math.round(Math.max(400, Math.min(3000, r)));

function make(method: PerformanceMethod, rating: number, error: number, scale: MethodEstimate['scale']): MethodEstimate {
  const r = clampRating(rating);
  const e = Math.round(error);
  return { method, rating: r, low: clampRating(r - Z80 * e), high: clampRating(r + Z80 * e), error: e, scale };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Classic performance rating: average opponent + 400·log10(S / (1 − S)), S smoothed by half a point. */
export function performanceRating(results: Array<{ opponentRating: number; score: number }>): number {
  const n = results.length;
  const s = (results.reduce((t, r) => t + r.score, 0) + 0.5) / (n + 1);
  return mean(results.map((r) => r.opponentRating)) + 400 * Math.log10(s / (1 - s));
}

/** Mean Lichess-style accuracy of the scored moves (0–100), or null when too few. */
export function scoredAccuracy(features: MoveFeature[]): number | null {
  const scored = features.filter(isScored);
  return scored.length >= MIN_SCORED_MOVES ? mean(scored.map((f) => moveAccuracy(f.winLoss))) : null;
}

/**
 * Move-quality estimates (accuracy and ACPL models) from the moves of `games`
 * games. The game count matters: with fewer games the models shrink harder
 * toward the average, because a single game says little.
 */
export function moveQualityEstimates(features: MoveFeature[], games: number): { accuracy: MethodEstimate; acpl: MethodEstimate } | null {
  const scored = features.filter(isScored);
  if (games < 1 || scored.length < MIN_SCORED_MOVES) return null;
  const acc = mean(scored.map((f) => moveAccuracy(f.winLoss)));
  const lnAcpl = Math.log(mean(scored.map((f) => Math.max(0, f.before - f.after))) + 1);
  return {
    accuracy: make(
      'accuracy',
      interp(calibration.accuracy, games, 'a') + interp(calibration.accuracy, games, 'b') * acc,
      interp(calibration.accuracy, games, 'rmse'),
      'lichess',
    ),
    acpl: make(
      'acpl',
      interp(calibration.acpl, games, 'a') + interp(calibration.acpl, games, 'b') * lnAcpl,
      interp(calibration.acpl, games, 'rmse'),
      'lichess',
    ),
  };
}

/** Most common conversion speed among the games. */
function dominantSpeed(games: GameEvidence[]): ScaleSpeed | null {
  const n = { blitz: 0, rapid: 0 };
  for (const g of games) {
    const sp = scaleSpeed(g.speed);
    if (sp) n[sp]++;
  }
  return n.blitz + n.rapid === 0 ? null : n.blitz >= n.rapid ? 'blitz' : 'rapid';
}

/** A Lichess-scale estimate re-expressed on the Chess.com scale; the conversion's own error is added. */
function toChesscom(e: MethodEstimate, speed: ScaleSpeed): MethodEstimate {
  const c = lichessToChesscom(e.rating, speed)!;
  const error = Math.hypot(e.error * conversionSlope(e.rating, speed), c.se);
  return { ...make(e.method, c.rating, error, 'chesscom'), equivalent: { scale: 'lichess', rating: e.rating } };
}

/** Adds the other site's equivalent to an estimate already on the Lichess or Chess.com scale. */
function withEquivalent(e: MethodEstimate | null, speed: ScaleSpeed | null): MethodEstimate | null {
  if (!e || e.equivalent || !hasConversion(speed)) return e;
  if (e.scale === 'lichess') return { ...e, equivalent: { scale: 'chesscom', rating: lichessToChesscom(e.rating, speed)!.rating } };
  if (e.scale === 'chesscom') return { ...e, equivalent: { scale: 'lichess', rating: chesscomToLichess(e.rating, speed)!.rating } };
  return e;
}

export function estimatePerformance(games: GameEvidence[], platform: Platform | null): PerformanceEstimate {
  const n = games.length;
  const features = games.flatMap((g) => g.features);
  const own = games.map((g) => g.playerRating).filter((r): r is number => typeof r === 'number' && r > 0);
  const speed = dominantSpeed(games);
  const convertible = platform === 'chesscom' && hasConversion(speed);

  const quality = moveQualityEstimates(features, n);
  let accuracy = quality?.accuracy ?? null;
  let acpl = quality?.acpl ?? null;
  if (convertible) {
    accuracy = accuracy && toChesscom(accuracy, speed);
    acpl = acpl && toChesscom(acpl, speed);
  }

  const rated = games.flatMap((g) =>
    typeof g.opponentRating === 'number' && g.opponentRating > 0 && typeof g.score === 'number'
      ? [{ opponentRating: g.opponentRating, score: g.score }]
      : [],
  );
  const results = rated.length > 0
    ? make('results', performanceRating(rated), interp(calibration.pr, rated.length, 'rmse'), platform ?? 'unknown')
    : null;

  let combined: MethodEstimate | null = null;
  let disagreement = false;
  if (accuracy && results && results.scale === accuracy.scale) {
    const w = interp(calibration.combined, n, 'weightPr');
    // The combined error was measured on Lichess; add the converted accuracy part's extra error.
    const extra = accuracy.scale === 'chesscom' ? (1 - w) * Math.sqrt(Math.max(0, accuracy.error ** 2 - interp(calibration.accuracy, n, 'rmse') ** 2)) : 0;
    combined = make('combined', w * results.rating + (1 - w) * accuracy.rating, Math.hypot(interp(calibration.combined, n, 'rmse'), extra), accuracy.scale);
    disagreement = Math.abs(accuracy.rating - results.rating) > Z80 * Math.hypot(accuracy.error, results.error);
  }

  const playerRating = own.length ? Math.round(mean(own)) : null;
  const playerRatingLichess = playerRating === null
    ? null
    : platform === 'chesscom'
      ? chesscomToLichess(playerRating, speed)?.rating ?? null
      : playerRating;

  return {
    games: n,
    scoredMoves: features.filter(isScored).length,
    platform,
    playerRating,
    playerRatingLichess,
    accuracy: withEquivalent(accuracy, speed),
    acpl: withEquivalent(acpl, speed),
    results: withEquivalent(results, speed),
    combined: withEquivalent(combined, speed),
    disagreement,
  };
}

/** Lichess-scale rating of a player for Lichess-based norms (time-management bands). */
export function lichessReference(p: PerformanceEstimate): number | null {
  if (p.playerRatingLichess !== null) return p.playerRatingLichess;
  const a = p.accuracy;
  if (!a) return null;
  return a.scale === 'lichess' ? a.rating : a.equivalent?.scale === 'lichess' ? a.equivalent.rating : null;
}

/** The estimate to headline: the combined one when available, else results, else accuracy. */
export function headlineEstimate(p: PerformanceEstimate, method: PerformanceMethod | 'auto' = 'auto'): MethodEstimate | null {
  if (method !== 'auto') return p[method];
  return p.combined ?? p.results ?? p.accuracy;
}

export const CALIBRATION_SOURCE = calibration.source;
