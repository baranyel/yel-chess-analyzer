import type { AnalyzedMove } from './types';
import { computeAccuracy, computeAcpl, estimateElo } from './classification';

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export interface PhasePlayerStats {
  accuracy: number;
  acpl: number;
  estimatedElo: number;
  moveCount: number;
}

export interface PhaseStats {
  white: PhasePlayerStats;
  black: PhasePlayerStats;
}

export interface PhaseBreakdown {
  opening: PhaseStats;
  middlegame: PhaseStats;
  endgame: PhaseStats;
}

function materialCount(fen: string): number {
  let total = 0;
  for (const c of (fen.split(' ')[0] ?? '')) {
    switch (c.toLowerCase()) {
      case 'q': total += 9; break;
      case 'r': total += 5; break;
      case 'b': case 'n': total += 3; break;
    }
  }
  return total;
}

function detectPhase(move: AnalyzedMove): GamePhase {
  // 0-based half-move index: move 1 white = 0, move 1 black = 1, move 10 black = 19, …
  const halfIdx = (move.moveNumber - 1) * 2 + (move.color === 'b' ? 1 : 0);
  if (halfIdx < 20) return 'opening'; // first 10 full moves
  if (materialCount(move.fenAfter) <= 14) return 'endgame';
  return 'middlegame';
}

function playerStats(moves: AnalyzedMove[]): PhasePlayerStats {
  if (moves.length === 0) return { accuracy: 0, acpl: 0, estimatedElo: 0, moveCount: 0 };
  const acpl = computeAcpl(moves);
  return {
    accuracy: computeAccuracy(moves),
    acpl,
    estimatedElo: estimateElo(acpl),
    moveCount: moves.length,
  };
}

export function computePhaseBreakdown(moves: AnalyzedMove[]): PhaseBreakdown {
  const buckets: Record<GamePhase, { w: AnalyzedMove[]; b: AnalyzedMove[] }> = {
    opening:    { w: [], b: [] },
    middlegame: { w: [], b: [] },
    endgame:    { w: [], b: [] },
  };

  for (const move of moves) {
    buckets[detectPhase(move)][move.color].push(move);
  }

  const build = (phase: GamePhase): PhaseStats => ({
    white: playerStats(buckets[phase].w),
    black: playerStats(buckets[phase].b),
  });

  return {
    opening:    build('opening'),
    middlegame: build('middlegame'),
    endgame:    build('endgame'),
  };
}
