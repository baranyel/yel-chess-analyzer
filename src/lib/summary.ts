import { computeAccuracy, computeAcpl } from './classification';
import { estimatePerformance, lichessReference, moveQualityEstimates } from './performance/estimate';
import { moveFeatures, plyIndex } from './performance/moves';
import { timeManagement } from './performance/timeManagement';
import type { PgnClockInfo } from './pgn';
import type { AnalyzedMove, GameSummaryStats, MoveClassification, PgnMetadata, PlayerStats } from './types';

const EMPTY_STATS: PlayerStats = {
  kusursuz: 0, muhtesem: 0, best: 0, excellent: 0, good: 0,
  inaccuracy: 0, mistake: 0, blunder: 0, accuracy: 0, acpl: 0, estimatedElo: 0,
};

/**
 * Stats for one player's moves. `games` is how many games the moves come from;
 * it selects the calibration used for the rating estimate.
 */
export function buildPlayerStats(moves: AnalyzedMove[], games = 1): PlayerStats {
  if (moves.length === 0) return { ...EMPTY_STATS };
  const count = (cls: MoveClassification) => moves.filter((m) => m.classification === cls).length;
  const quality = moveQualityEstimates(moveFeatures(moves), games);
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
    acpl: computeAcpl(moves),
    estimatedElo: quality?.accuracy.rating ?? 0,
  };
}

/** Score of `color` from a PGN result string, or null for an unfinished game. */
export function scoreFromResult(result: string, color: 'w' | 'b'): number | null {
  const r = result.replace(/\s/g, '');
  const white = r === '1-0' ? 1 : r === '0-1' ? 0 : r === '1/2-1/2' || r === '½-½' ? 0.5 : null;
  return white === null ? null : color === 'w' ? white : 1 - white;
}

const ratingOf = (elo: string | number | undefined) => {
  const n = typeof elo === 'number' ? elo : parseInt(elo ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface SummaryContext {
  metadata: PgnMetadata;
  clockInfo: PgnClockInfo;
}

/**
 * Per-side summary. With the game's PGN context it also includes a single-game
 * performance estimate (results + accuracy) and the time-management score.
 */
export function buildSummary(moves: AnalyzedMove[], ctx?: SummaryContext): GameSummaryStats {
  const side = (color: 'w' | 'b'): PlayerStats => {
    const own = moves.filter((m) => m.color === color);
    const stats = buildPlayerStats(own);
    if (!ctx || own.length === 0) return stats;

    const { metadata, clockInfo } = ctx;
    // The models were calibrated on blitz, rapid and classical games only.
    if (clockInfo.speed === 'bullet' || clockInfo.speed === 'daily') {
      return { ...stats, estimatedElo: 0, ratingOutOfScope: true };
    }
    const features = moveFeatures(own);
    const playerRating = ratingOf(color === 'w' ? metadata.whiteElo : metadata.blackElo);
    const performance = estimatePerformance(
      [{
        features,
        opponentRating: ratingOf(color === 'w' ? metadata.blackElo : metadata.whiteElo),
        score: scoreFromResult(metadata.result, color),
        playerRating,
        speed: clockInfo.speed,
      }],
      clockInfo.platform,
    );
    const time = clockInfo.clocks && clockInfo.timeControl
      ? timeManagement(
          [{ features, clocks: clockInfo.clocks, timeControl: clockInfo.timeControl, firstPly: moves[0] ? plyIndex(moves[0]) : 0 }],
          lichessReference(performance),
        )
      : null;
    return { ...stats, performance, timeManagement: time };
  };
  return { white: side('w'), black: side('b') };
}
