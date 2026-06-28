import { Chess } from 'chess.js';
import { StockfishService } from '../engine/StockfishService';
import { parsePgn } from './pgn';
import { hasAnalysisRecord, loadAnalysisRecord, saveAnalysisRecord, computeGameId } from './analysisHistory';
import {
  classifyMove,
  computeCpLoss,
  computeSecondBestCpLoss,
  computeAccuracy,
  computeAcpl,
  estimateElo,
} from './classification';
import { computePlayerPhaseBreakdown, type PlayerPhaseBreakdown } from './phases';
import type { AnalyzedMove, PlayerStats, EvalResult } from './types';
import type { GameSummary } from './accounts';

const MULTI_PV = 3;
const TOTAL_HASH_BUDGET_MB = 512;

export interface AccountAnalysisResult {
  username: string;
  gamesAnalyzed: number;
  stats: PlayerStats;
  phaseBreakdown: PlayerPhaseBreakdown;
}

// ── Single-game engine analysis ───────────────────────────────────────────

async function analyzeGameMoves(
  pgn: string,
  enginePath: string,
  depth: number,
  workerCount: number,
  hashMb: number,
  abort: { aborted: boolean },
): Promise<AnalyzedMove[]> {
  let parsed: ReturnType<typeof parsePgn>;
  try { parsed = parsePgn(pgn); } catch { return []; }

  const { fens, moves: sanMoves } = parsed;
  const effectiveHashMb = Math.max(16, Math.min(hashMb, Math.floor(TOTAL_HASH_BUDGET_MB / workerCount)));
  const workers = Array.from({ length: workerCount }, () => new StockfishService(enginePath, effectiveHashMb));

  const evalCache: (EvalResult | null)[] = new Array(fens.length).fill(null);
  const bestMoves: (string | null)[]  = new Array(fens.length).fill(null);
  const altMoves: string[][]           = new Array(fens.length).fill([]);
  const altEvals: (EvalResult[])[]     = new Array(fens.length).fill([]);

  // Pre-pass: mark terminal positions
  const moveData: Array<{ color: 'w' | 'b'; uci: string }> = [];
  {
    const chess = new Chess();
    for (let i = 0; i < sanMoves.length; i++) {
      const m = chess.move(sanMoves[i]);
      moveData.push({ color: m.color, uci: m.lan ?? '' });
      if (chess.isGameOver()) {
        evalCache[i + 1] = chess.isCheckmate()
          ? { type: 'mate', value: m.color === 'w' ? 1 : -1 }
          : { type: 'cp', value: 0 };
      }
    }
  }

  const pending = fens.map((_, i) => i).filter((i) => evalCache[i] === null);

  await new Promise<void>((resolve) => {
    if (pending.length === 0 || abort.aborted) { resolve(); return; }
    let completed = 0;
    let qi = 0;
    const runNext = (wi: number) => {
      if (abort.aborted || qi >= pending.length) return;
      const posIdx = pending[qi++]!;
      workers[wi].analyze(fens[posIdx]!, depth, MULTI_PV, (result) => {
        if (abort.aborted) return;
        evalCache[posIdx] = result.eval;
        bestMoves[posIdx] = result.bestMove;
        altMoves[posIdx]  = result.alternatives;
        altEvals[posIdx]  = result.alternativeEvals;
        if (++completed >= pending.length) resolve();
        else runNext(wi);
      });
    };
    for (let w = 0; w < workerCount && w < pending.length; w++) runNext(w);
  });

  workers.forEach((w) => w.terminate());
  if (abort.aborted) return [];

  // Build AnalyzedMove array
  const analyzedMoves: AnalyzedMove[] = [];
  for (let i = 0; i < sanMoves.length; i++) {
    if (!evalCache[i] || !evalCache[i + 1]) continue;
    const { color, uci } = moveData[i]!;
    const evalBefore = evalCache[i]!;
    const evalAfter  = evalCache[i + 1]!;
    const cpLoss = computeCpLoss(evalBefore, evalAfter, color);
    const alt2   = altEvals[i]?.[0] ?? null;
    const secondBestCpLoss = alt2 ? computeSecondBestCpLoss(evalBefore, alt2, color) : 9999;
    analyzedMoves.push({
      moveNumber: Math.floor(i / 2) + 1,
      color,
      san:           sanMoves[i]!,
      uci,
      fenBefore:     fens[i]!,
      fenAfter:      fens[i + 1]!,
      evalBefore,
      evalAfter,
      bestMove:      bestMoves[i],
      bestEval:      evalBefore,
      alternatives:  altMoves[i] ?? [],
      alternativeEvals: altEvals[i] ?? [],
      classification: classifyMove(cpLoss, secondBestCpLoss, uci, bestMoves[i]),
      cpLoss,
      secondBestCpLoss,
    });
  }

  return analyzedMoves;
}

// ── Helper ────────────────────────────────────────────────────────────────

function buildPlayerStats(moves: AnalyzedMove[]): PlayerStats {
  if (moves.length === 0) {
    return { kusursuz: 0, muhtesem: 0, best: 0, excellent: 0, good: 0,
             inaccuracy: 0, mistake: 0, blunder: 0, accuracy: 0, acpl: 0, estimatedElo: 0 };
  }
  const count = (cls: string) => moves.filter((m) => m.classification === cls).length;
  const acpl = computeAcpl(moves);
  return {
    kusursuz: count('kusursuz'), muhtesem: count('muhtesem'), best: count('best'),
    excellent: count('excellent'), good: count('good'), inaccuracy: count('inaccuracy'),
    mistake: count('mistake'), blunder: count('blunder'),
    accuracy: computeAccuracy(moves), acpl, estimatedElo: estimateElo(acpl),
  };
}

// ── Main export ───────────────────────────────────────────────────────────

export async function runAccountAnalysis(
  games: GameSummary[],
  username: string,
  enginePath: string,
  engineId: string,
  depth: number,
  workerCount: number,
  hashMb: number,
  onProgress: (done: number, total: number, currentGame: string) => void,
  abort: { aborted: boolean },
): Promise<AccountAnalysisResult> {
  const allPlayerMoves: AnalyzedMove[] = [];
  let gamesAnalyzed = 0;

  for (let i = 0; i < games.length; i++) {
    if (abort.aborted) break;

    const game = games[i]!;
    const pgn  = game.pgn.trim();
    const gameLabel = `${game.white} — ${game.black}`;
    onProgress(i, games.length, gameLabel);

    // Determine which side the username played
    const isWhite = game.white.toLowerCase() === username.toLowerCase();
    const isBlack = game.black.toLowerCase() === username.toLowerCase();
    if (!isWhite && !isBlack) { onProgress(i + 1, games.length, ''); continue; }
    const playerColor: 'w' | 'b' = isWhite ? 'w' : 'b';

    const gameId = computeGameId(pgn);
    let allMoves: AnalyzedMove[];

    if (hasAnalysisRecord(gameId)) {
      allMoves = loadAnalysisRecord(gameId)?.moves ?? [];
    } else {
      allMoves = await analyzeGameMoves(pgn, enginePath, depth, workerCount, hashMb, abort);

      if (!abort.aborted && allMoves.length > 0) {
        try {
          const p = parsePgn(pgn);
          const wMoves = allMoves.filter((m) => m.color === 'w');
          const bMoves = allMoves.filter((m) => m.color === 'b');
          saveAnalysisRecord({
            gameId, pgn, analyzedAt: Date.now(), depth, engineId,
            moves: allMoves,
            summary: { white: buildPlayerStats(wMoves), black: buildPlayerStats(bMoves) },
            fens: p.fens, sanMoves: p.moves, metadata: p.metadata,
          });
        } catch { /* ignore */ }
      }
    }

    if (abort.aborted) break;

    allPlayerMoves.push(...allMoves.filter((m) => m.color === playerColor));
    gamesAnalyzed++;
    onProgress(i + 1, games.length, '');
  }

  return {
    username,
    gamesAnalyzed,
    stats: buildPlayerStats(allPlayerMoves),
    phaseBreakdown: computePlayerPhaseBreakdown(allPlayerMoves),
  };
}
