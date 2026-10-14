import { StockfishService } from '../engine/StockfishService';
import { EnginePool, analyzeGame } from '../engine/analyzeGame';
import { throwIfAborted } from '../engine/types';
import { parseClockInfo, parsePgn } from './pgn';
import { loadAnalysisRecord, saveAnalysisRecord, computeGameId } from './analysisHistory';
import { effectiveHashMb } from './engineConfig';
import { buildPlayerStats, buildSummary, scoreFromResult } from './summary';
import { computePlayerPhaseBreakdown, type PlayerPhaseBreakdown } from './phases';
import { estimatePerformance, lichessReference, type GameEvidence, type PerformanceEstimate } from './performance/estimate';
import { moveFeatures, plyIndex } from './performance/moves';
import { timeManagement, type GameTimeInput, type TimeManagementResult } from './performance/timeManagement';
import type { AnalyzedMove, PlayerStats } from './types';
import type { GameSummary, Platform } from './accounts';

export interface AccountAnalysisResult {
  username: string;
  gamesAnalyzed: number;
  /** Games that could not be analysed (unparsable PGN, no moves, user not a player). */
  skipped: number;
  stats: PlayerStats;
  phaseBreakdown: PlayerPhaseBreakdown;
  performance: PerformanceEstimate;
  /** Null when none of the games has clock data. */
  timeManagement: TimeManagementResult | null;
  /** Analysed games left out of the estimate: bullet and daily/correspondence
   *  games are outside the time controls the models were calibrated on. */
  outOfScope: number;
}

const OUT_OF_SCOPE_TIME_CONTROLS = new Set(['Bullet', 'Günlük', 'Yazışmalı']);
const LABEL_SPEED: Record<string, string> = { Blitz: 'blitz', Rapid: 'rapid', Klasik: 'classical' };

export interface AccountProgress {
  /** Games fully processed so far. */
  done: number;
  total: number;
  /** "White — Black" of the game being analysed, '' between games. */
  currentGame: string;
  /** 0–1 overall progress, including the partially analysed current game. */
  fraction: number;
  /** Rough time left, or null until one game has been analysed by the engine. */
  etaMs: number | null;
}

/** A stored analysis is reusable only if it is at least as deep and from the same engine. */
function isReusable(record: { engineId: string; depth: number } | null, engineId: string, depth: number): boolean {
  return !!record && record.engineId === engineId && record.depth >= depth;
}

/**
 * Analyses the user's side of every game and aggregates the result.
 * One engine pool is created lazily and reused for all games.
 *
 * Throws an AbortError when `signal` aborts and an EngineError when an engine fails.
 */
export async function runAccountAnalysis(
  games: GameSummary[],
  username: string,
  enginePath: string,
  engineId: string,
  depth: number,
  workerCount: number,
  hashMb: number,
  onProgress: (p: AccountProgress) => void,
  signal: AbortSignal,
): Promise<AccountAnalysisResult> {
  const allPlayerMoves: AnalyzedMove[] = [];
  const evidence: GameEvidence[] = [];
  const timeInputs: GameTimeInput[] = [];
  let platform: Platform | null = null;
  let gamesAnalyzed = 0;
  let outOfScope = 0;
  let skipped = 0;

  let pool: EnginePool | null = null;
  let engineMs = 0;
  let engineGames = 0;

  const report = (done: number, currentGame: string, gameFraction: number) => {
    const total = games.length;
    const remaining = total - done;
    onProgress({
      done,
      total,
      currentGame,
      fraction: total > 0 ? Math.min(1, (done + gameFraction) / total) : 0,
      etaMs: engineGames > 0 ? Math.round((engineMs / engineGames) * Math.max(0, remaining - gameFraction)) : null,
    });
  };

  try {
    for (let i = 0; i < games.length; i++) {
      throwIfAborted(signal);

      const game = games[i]!;
      const pgn = game.pgn.trim();
      const label = `${game.white} — ${game.black}`;
      report(i, label, 0);

      // Which side did the user play?
      const isWhite = game.white.toLowerCase() === username.toLowerCase();
      const isBlack = game.black.toLowerCase() === username.toLowerCase();
      if (!isWhite && !isBlack) { skipped++; report(i + 1, '', 0); continue; }
      const playerColor: 'w' | 'b' = isWhite ? 'w' : 'b';

      let parsed: ReturnType<typeof parsePgn>;
      try {
        parsed = parsePgn(pgn);
      } catch {
        skipped++; report(i + 1, '', 0); continue;
      }

      const clockInfo = parseClockInfo(pgn, parsed.moves.length);
      const gameId = computeGameId(pgn);
      const stored = loadAnalysisRecord(gameId);
      let moves: AnalyzedMove[];

      if (stored && isReusable(stored, engineId, depth)) {
        moves = stored.moves;
      } else {
        pool ??= new EnginePool(
          () => new StockfishService(enginePath, effectiveHashMb(workerCount, hashMb)),
          workerCount,
          signal,
        );
        const startedAt = Date.now();
        let movesDone = 0;
        const result = await analyzeGame({
          fens: parsed.fens,
          sanMoves: parsed.moves,
          depth,
          pool,
          signal,
          onMove: () => {
            movesDone++;
            report(i, label, movesDone / Math.max(1, parsed.moves.length));
          },
        });
        engineMs += Date.now() - startedAt;
        engineGames++;
        moves = result.moves;

        saveAnalysisRecord({
          gameId, pgn, analyzedAt: Date.now(), depth, engineId,
          moves,
          summary: buildSummary(moves, { metadata: parsed.metadata, clockInfo }),
          fens: parsed.fens, sanMoves: parsed.moves, metadata: parsed.metadata,
        });
      }

      const own = moves.filter((m) => m.color === playerColor);
      allPlayerMoves.push(...own);
      gamesAnalyzed++;
      report(i + 1, '', 0);
      if (game.timeControl && OUT_OF_SCOPE_TIME_CONTROLS.has(game.timeControl)) { outOfScope++; continue; }

      const features = moveFeatures(own);
      platform ??= game.platform;
      evidence.push({
        features,
        opponentRating: (isWhite ? game.blackElo : game.whiteElo) ?? null,
        playerRating: (isWhite ? game.whiteElo : game.blackElo) ?? null,
        score: scoreFromResult(parsed.metadata.result, playerColor),
        // The platform's own time class is authoritative; the PGN time control is a fallback.
        speed: (game.timeControl && LABEL_SPEED[game.timeControl]) ?? clockInfo.speed,
      });
      if (clockInfo.clocks && clockInfo.timeControl) {
        timeInputs.push({
          features,
          clocks: clockInfo.clocks,
          timeControl: clockInfo.timeControl,
          firstPly: moves[0] ? plyIndex(moves[0]) : 0,
        });
      }
    }
  } finally {
    pool?.terminate();
  }

  const performance = estimatePerformance(evidence, platform);
  return {
    username,
    gamesAnalyzed,
    skipped,
    stats: buildPlayerStats(allPlayerMoves, Math.max(1, gamesAnalyzed)),
    phaseBreakdown: computePlayerPhaseBreakdown(allPlayerMoves),
    performance,
    timeManagement: timeManagement(timeInputs, lichessReference(performance)),
    outOfScope,
  };
}
