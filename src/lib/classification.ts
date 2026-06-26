import type { MoveClassification, EvalResult } from './types';

// ── Centipawn-loss thresholds (all values in centipawns) ──────────────────
// Edit here to calibrate labeling.
export const CLASSIFICATION_THRESHOLDS = {
  excellent:   8,   // <= 8 cp loss
  good:       20,   // <= 20 cp loss
  inaccuracy: 50,   // <= 50 cp loss
  mistake:   100,   // <= 100 cp loss
  // blunder: > mistake threshold

  // "Kusursuz" (forced/only-move): played the best move AND 2nd best is >> worse
  kusursuzSecondBest: 250,

  // "Muhteşem" (brilliant): played the best move AND 2nd best is notably worse
  muhtesemSecondBest: 130,
} as const;

// Cap mate distance at this centipawn equivalent for arithmetic purposes
const MATE_CP = 10_000;

export function evalToCp(e: EvalResult): number {
  return e.type === 'mate'
    ? (e.value > 0 ? MATE_CP : -MATE_CP)
    : e.value;
}

/**
 * Returns how many centipawns worse the played move was compared to the
 * engine's best move, from the perspective of the side that just moved.
 *
 * Both evals are in white's POV (positive = white better).
 * bestEval is the eval Stockfish assigned to position BEFORE the move
 *   (i.e. the best achievable outcome from that side).
 * playedEval is the eval of the position AFTER the played move
 *   (i.e. what actually happened).
 */
export function computeCpLoss(
  bestEval: EvalResult,    // eval of position BEFORE move (= best line score)
  playedEval: EvalResult,  // eval of position AFTER played move
  color: 'w' | 'b',
): number {
  const sign = color === 'w' ? 1 : -1;
  const bestCp   = evalToCp(bestEval)   * sign;
  const playedCp = evalToCp(playedEval) * sign;
  return Math.max(0, bestCp - playedCp);
}

/**
 * Compute how much centipawn advantage the 2nd-best alternative *loses*
 * compared to the best move (from mover's POV).
 * Used to detect forced/brilliant moves.
 */
export function computeSecondBestCpLoss(
  bestEval: EvalResult,
  secondBestEval: EvalResult | null,
  color: 'w' | 'b',
): number {
  if (!secondBestEval) return 9999; // no alternative — fully forced
  return computeCpLoss(bestEval, secondBestEval, color);
}

export function classifyMove(
  cpLoss: number,
  secondBestCpLoss: number,
  playedUci: string,
  bestUci: string | null,
): MoveClassification {
  if (!bestUci) return 'unknown';

  const normalize = (m: string) => m.slice(0, 4);
  const isExactBest = normalize(playedUci) === normalize(bestUci);

  if (isExactBest) {
    if (secondBestCpLoss >= CLASSIFICATION_THRESHOLDS.kusursuzSecondBest) return 'kusursuz';
    if (secondBestCpLoss >= CLASSIFICATION_THRESHOLDS.muhtesemSecondBest) return 'muhtesem';
    return 'best';
  }

  if (cpLoss <= CLASSIFICATION_THRESHOLDS.excellent)   return 'excellent';
  if (cpLoss <= CLASSIFICATION_THRESHOLDS.good)        return 'good';
  if (cpLoss <= CLASSIFICATION_THRESHOLDS.inaccuracy)  return 'inaccuracy';
  if (cpLoss <= CLASSIFICATION_THRESHOLDS.mistake)     return 'mistake';
  return 'blunder';
}

// ── Visual style per classification ──────────────────────────────────────
export interface ClassificationStyle {
  label: string;
  labelTr: string;
  color: string;
  bg: string;
  border: string;
  icon: string;
}

export const CLASSIFICATION_STYLES: Record<MoveClassification, ClassificationStyle> = {
  kusursuz:   { label: 'Forced',     labelTr: 'Kusursuz', color: 'var(--clr-kusursuz)',   bg: '', border: '', icon: '□'  },
  muhtesem:   { label: 'Brilliant',  labelTr: 'Muhteşem', color: 'var(--clr-brilliant)',  bg: '', border: '', icon: '!!' },
  best:       { label: 'Best',       labelTr: 'En İyi',   color: 'var(--clr-best)',       bg: '', border: '', icon: '★'  },
  excellent:  { label: 'Excellent',  labelTr: 'Mükemmel', color: 'var(--clr-excellent)',  bg: '', border: '', icon: '✓'  },
  good:       { label: 'Good',       labelTr: 'İyi',      color: 'var(--clr-good)',       bg: '', border: '', icon: '◆'  },
  inaccuracy: { label: 'Inaccuracy', labelTr: 'Hamle(?!)',color: 'var(--clr-inaccuracy)', bg: '', border: '', icon: '?!' },
  mistake:    { label: 'Mistake',    labelTr: 'Yanılgı',  color: 'var(--clr-mistake)',    bg: '', border: '', icon: '?'  },
  blunder:    { label: 'Blunder',    labelTr: 'Gaf',      color: 'var(--clr-blunder)',    bg: '', border: '', icon: '??' },
  unknown:    { label: '?',          labelTr: '?',        color: 'var(--clr-unknown)',    bg: '', border: '', icon: '…'  },
};

// ── Accuracy score (0–100) ────────────────────────────────────────────────
const ACCURACY_WEIGHTS: Record<MoveClassification, number> = {
  kusursuz: 100,
  muhtesem: 100,
  best:     100,
  excellent: 95,
  good:      85,
  inaccuracy:60,
  mistake:   35,
  blunder:   10,
  unknown:   75,
};

export function computeAccuracy(moves: { classification: MoveClassification }[]): number {
  if (moves.length === 0) return 100;
  const total = moves.reduce((s, m) => s + ACCURACY_WEIGHTS[m.classification], 0);
  return Math.round(total / moves.length);
}

// ── ACPL ─────────────────────────────────────────────────────────────────
export function computeAcpl(moves: { cpLoss: number }[]): number {
  if (moves.length === 0) return 0;
  return Math.round(moves.reduce((s, m) => s + m.cpLoss, 0) / moves.length);
}

// ── FIDE rating estimate from ACPL ───────────────────────────────────────
// Empirical log-scale approximation. Rough but reasonable.
export function estimateElo(acpl: number): number {
  if (acpl <= 0) return 2900;
  const elo = Math.round(3491 - 403 * Math.log(acpl + 1));
  return Math.max(800, Math.min(3000, elo));
}
