import type { MoveClassification, EvalResult } from './types';

// Mate scores are treated as this many centipawns for win-probability math
// (the sigmoid saturates, so the exact value does not matter there).
const MATE_CP = 10_000;

// Centipawn-loss / ACPL math clamps every evaluation to ±CP_CLAMP, like Lichess.
// Without it a single missed mate (+M3 → +5.0) costs 9 500 cp and one decided
// position (+20 → +8) costs 1 200 cp, which wrecks ACPL and the Elo estimate.
export const CP_CLAMP = 1000;

export function evalToCp(e: EvalResult): number {
  return e.type === 'mate' ? (e.value > 0 ? MATE_CP : -MATE_CP) : e.value;
}

export function clampedCp(e: EvalResult): number {
  if (e.type === 'mate') return e.value > 0 ? CP_CLAMP : -CP_CLAMP;
  return Math.max(-CP_CLAMP, Math.min(CP_CLAMP, e.value));
}

// ── Win probability model (Lichess / Chess.com sigmoid) ───────────────────
// Converts centipawns (from mover's perspective, positive = mover better)
// to a win probability [0–100].
export function cpToWinPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1);
}

// Win-probability drop for the moving side (0–100, higher = worse move).
// evalBefore: Stockfish best-line eval before the move (white's POV).
// evalAfter:  eval of the position reached after the played move (white's POV).
export function computeWinPctLoss(
  evalBefore: EvalResult,
  evalAfter: EvalResult,
  color: 'w' | 'b',
): number {
  const sign = color === 'w' ? 1 : -1;
  const before = cpToWinPct(evalToCp(evalBefore) * sign);
  const after  = cpToWinPct(evalToCp(evalAfter)  * sign);
  return Math.max(0, before - after);
}

// ── Classification thresholds (win-% drop from mover's perspective) ───────
export const CLASSIFICATION_THRESHOLDS = {
  excellent:   2,   // ≤ 2 % win-chance drop
  good:        5,   // ≤ 5 %
  inaccuracy: 10,   // ≤ 10 %
  mistake:    20,   // ≤ 20 %
  // blunder: > 20 %

  // "Kusursuz": 2nd-best move costs the mover > 20 % win probability
  kusursuzSecondBest: 20,
  // "Muhteşem": 2nd-best costs > 10 % win probability
  muhtesemSecondBest: 10,
} as const;

// ── Centipawn loss (kept for ACPL display) ────────────────────────────────
export function computeCpLoss(
  bestEval: EvalResult,
  playedEval: EvalResult,
  color: 'w' | 'b',
): number {
  const sign = color === 'w' ? 1 : -1;
  return Math.max(0, clampedCp(bestEval) * sign - clampedCp(playedEval) * sign);
}

// ── Classification ────────────────────────────────────────────────────────
// winPctLoss / secondBestWinPctLoss: values from computeWinPctLoss()
export function classifyMove(
  winPctLoss: number,
  secondBestWinPctLoss: number,
  playedUci: string,
  bestUci: string | null,
): MoveClassification {
  if (!bestUci) return 'unknown';

  // Compare the full UCI string so an under-promotion (e7e8n) is not mistaken
  // for the engine's queen promotion (e7e8q).
  const isExactBest = playedUci.toLowerCase() === bestUci.toLowerCase();

  if (isExactBest) {
    if (secondBestWinPctLoss >= CLASSIFICATION_THRESHOLDS.kusursuzSecondBest) return 'kusursuz';
    if (secondBestWinPctLoss >= CLASSIFICATION_THRESHOLDS.muhtesemSecondBest) return 'muhtesem';
    return 'best';
  }

  if (winPctLoss <= CLASSIFICATION_THRESHOLDS.excellent)   return 'excellent';
  if (winPctLoss <= CLASSIFICATION_THRESHOLDS.good)        return 'good';
  if (winPctLoss <= CLASSIFICATION_THRESHOLDS.inaccuracy)  return 'inaccuracy';
  if (winPctLoss <= CLASSIFICATION_THRESHOLDS.mistake)     return 'mistake';
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
  kusursuz: 100, muhtesem: 100, best: 100, excellent: 95, good: 85,
  inaccuracy: 60, mistake: 35, blunder: 10, unknown: 75,
};

export function computeAccuracy(moves: { classification: MoveClassification }[]): number {
  if (moves.length === 0) return 100;
  return Math.round(moves.reduce((s, m) => s + ACCURACY_WEIGHTS[m.classification], 0) / moves.length);
}

// ── ACPL (centipawn-based, for display) ───────────────────────────────────
export function computeAcpl(moves: { cpLoss: number }[]): number {
  if (moves.length === 0) return 0;
  return Math.round(moves.reduce((s, m) => s + m.cpLoss, 0) / moves.length);
}
