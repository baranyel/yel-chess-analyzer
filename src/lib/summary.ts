import { computeAccuracy, computeAcpl, estimateElo } from './classification';
import type { AnalyzedMove, GameSummaryStats, MoveClassification, PlayerStats } from './types';

const EMPTY_STATS: PlayerStats = {
  kusursuz: 0, muhtesem: 0, best: 0, excellent: 0, good: 0,
  inaccuracy: 0, mistake: 0, blunder: 0, accuracy: 0, acpl: 0, estimatedElo: 0,
};

/** Stats for one player's moves (all of them from a single game, or many games). */
export function buildPlayerStats(moves: AnalyzedMove[]): PlayerStats {
  if (moves.length === 0) return { ...EMPTY_STATS };
  const count = (cls: MoveClassification) => moves.filter((m) => m.classification === cls).length;
  const acpl = computeAcpl(moves);
  return {
    kusursuz: count('kusursuz'),
    muhtesem: count('muhtesem'),
    best: count('best'),
    excellent: count('excellent'),
    good: count('good'),
    inaccuracy: count('inaccuracy'),
    mistake: count('mistake'),
    blunder: count('blunder'),
    accuracy: computeAccuracy(moves),
    acpl,
    estimatedElo: estimateElo(acpl),
  };
}

export function buildSummary(moves: AnalyzedMove[]): GameSummaryStats {
  return {
    white: buildPlayerStats(moves.filter((m) => m.color === 'w')),
    black: buildPlayerStats(moves.filter((m) => m.color === 'b')),
  };
}
