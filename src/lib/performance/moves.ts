import { Chess } from 'chess.js';
import { clampedCp, cpToWinPct } from '../classification';
import type { AnalyzedMove } from '../types';
import calibration from './calibration.json';

// Same filter as scripts/calibrate/fit.mjs — change both together and re-run the fit.
export const MOVE_FILTER = calibration.filter;

/** One of the player's moves, reduced to what the rating models use. */
export interface MoveFeature {
  ply: number;      // 0-based half-move index from the start of the game
  forced: boolean;  // the only legal move
  before: number;   // eval before the move, mover's POV, clamped to ±1000 cp
  after: number;    // eval after the move, mover's POV, clamped
  winLoss: number;  // win-% drop for the mover (0–100)
}

/** 0-based half-move index: 1. e4 = 0, 1… e5 = 1. */
export function plyIndex(m: Pick<AnalyzedMove, 'moveNumber' | 'color'>): number {
  return (m.moveNumber - 1) * 2 + (m.color === 'b' ? 1 : 0);
}

function isForced(fen: string): boolean {
  try {
    return new Chess(fen).moves().length === 1;
  } catch {
    return false;
  }
}

/**
 * Features of every analysed move. Evals are clamped before the win-% conversion,
 * exactly like the calibration data, so a missed mate counts as a fall to
 * −1000 cp, not to −∞.
 */
export function moveFeatures(moves: AnalyzedMove[]): MoveFeature[] {
  const out: MoveFeature[] = [];
  for (const m of moves) {
    if (!m.evalBefore || !m.evalAfter) continue;
    const sign = m.color === 'w' ? 1 : -1;
    const before = clampedCp(m.evalBefore) * sign;
    const after = clampedCp(m.evalAfter) * sign;
    out.push({
      ply: plyIndex(m),
      forced: m.fenBefore ? isForced(m.fenBefore) : false,
      before,
      after,
      winLoss: Math.max(0, cpToWinPct(before) - cpToWinPct(after)),
    });
  }
  return out;
}

/**
 * Moves that say something about skill: out of the book phase, not forced and
 * not in an already decided position (where any move "loses" almost nothing).
 */
export function isScored(f: MoveFeature): boolean {
  return f.ply >= MOVE_FILTER.minPly && !f.forced && Math.abs(f.before) < MOVE_FILTER.maxAbsCp;
}

/** Lichess per-move accuracy from the win-% drop (lichess.org/page/accuracy). */
export function moveAccuracy(winLoss: number): number {
  return 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669;
}
