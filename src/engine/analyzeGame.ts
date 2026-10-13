import { Chess } from 'chess.js';
import { classifyMove, computeCpLoss, computeWinPctLoss } from '../lib/classification';
import { MULTI_PV_GAME, MULTI_PV_POSITION } from '../lib/engineConfig';
import type { AnalyzedMove, EvalResult, PositionAnalysis } from '../lib/types';
import { throwIfAborted, type AnalysisResult, type Engine, type EngineStage } from './types';

// ── Engine pool ───────────────────────────────────────────────────────────

/**
 * A fixed set of engines that share one lifetime. Aborting the signal (or
 * calling terminate()) kills every engine, which rejects whatever search is
 * still pending — so an `await` on the pool can never hang after a cancel.
 */
export class EnginePool {
  readonly engines: Engine[];
  private signal?: AbortSignal;
  private onAbort = () => this.terminate();

  constructor(factory: () => Engine, size: number, signal?: AbortSignal) {
    throwIfAborted(signal);
    this.engines = Array.from({ length: Math.max(1, size) }, () => factory());
    this.signal = signal;
    signal?.addEventListener('abort', this.onAbort, { once: true });
  }

  /** Resolves when every engine is ready; rejects as soon as one fails to load. */
  ready(): Promise<void> {
    return Promise.all(this.engines.map((e) => e.ready)).then(() => undefined);
  }

  terminate(): void {
    this.signal?.removeEventListener('abort', this.onAbort);
    this.engines.forEach((e) => e.terminate());
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function terminalPosition(ev: EvalResult): PositionAnalysis {
  return { eval: ev, bestMove: '', alternatives: [], alternativeEvals: [], depth: 0 };
}

/**
 * Positions the engine cannot (or need not) be asked about. Only real game-ending
 * states count: a threefold repetition or the 50-move rule is merely *claimable*,
 * so games routinely play on past them and the engine must still judge the position.
 */
function detectTerminal(chess: Chess): PositionAnalysis | null {
  if (chess.isCheckmate()) {
    // The side to move is the one that has been mated.
    return terminalPosition({ type: 'mate', value: chess.turn() === 'b' ? 1 : -1 });
  }
  if (chess.isStalemate() || chess.isInsufficientMaterial()) {
    return terminalPosition({ type: 'cp', value: 0 });
  }
  return null;
}

function fullmoveNumber(fen: string): number {
  const n = parseInt(fen.split(' ')[5] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function toPositionAnalysis(r: AnalysisResult): PositionAnalysis {
  return {
    eval: r.eval,
    bestMove: r.bestMove,
    alternatives: r.alternatives,
    alternativeEvals: r.alternativeEvals,
    depth: r.depth,
  };
}

interface MoveInfo {
  color: 'w' | 'b';
  san: string;
  uci: string;
}

export function buildAnalyzedMove(
  info: MoveInfo,
  fenBefore: string,
  fenAfter: string,
  before: PositionAnalysis,
  after: PositionAnalysis,
): AnalyzedMove {
  const { color, san, uci } = info;
  const cpLoss = computeCpLoss(before.eval, after.eval, color);
  const winPctLoss = computeWinPctLoss(before.eval, after.eval, color);

  // No runner-up line (only legal move, or a 1-line search) => treat as forced.
  const alt = before.alternativeEvals[0];
  const secondBestWinPctLoss = alt ? computeWinPctLoss(before.eval, alt, color) : 9999;

  return {
    moveNumber: fullmoveNumber(fenBefore),
    color,
    san,
    uci,
    fenBefore,
    fenAfter,
    evalBefore: before.eval,
    evalAfter: after.eval,
    bestMove: before.bestMove || null,
    alternatives: before.alternatives,
    alternativeEvals: before.alternativeEvals,
    classification: classifyMove(winPctLoss, secondBestWinPctLoss, uci, before.bestMove || null),
    cpLoss,
  };
}

// ── The pipeline ──────────────────────────────────────────────────────────

export interface AnalyzeGameOptions {
  fens: string[];       // fens[0] = start, fens[i] = position after move i-1
  sanMoves: string[];
  depth: number;
  pool: EnginePool;
  signal?: AbortSignal;
  /** Called once per move, strictly in game order, as soon as both its positions are known. */
  onMove?: (move: AnalyzedMove, index: number) => void;
  onStage?: (stage: EngineStage) => void;
}

export interface GameAnalysisResult {
  moves: AnalyzedMove[];
  /** Engine verdict for the last position (the only one in FEN mode). */
  lastPosition: PositionAnalysis;
}

/**
 * Analyses every position of a game once, in parallel over the pool, and turns
 * adjacent position pairs into classified moves. Used by both the single-game
 * analysis and the account (multi-game) analysis.
 *
 * Throws an AbortError when `signal` aborts and an EngineError when an engine
 * fails; it never leaves the pool running — the caller owns terminate().
 */
export async function analyzeGame(opts: AnalyzeGameOptions): Promise<GameAnalysisResult> {
  const { fens, sanMoves, depth, pool, signal, onMove, onStage } = opts;
  throwIfAborted(signal);

  const total = fens.length;
  const positions: (PositionAnalysis | null)[] = new Array(total).fill(null);

  // Pre-pass: replay the game from its own start position to collect UCI moves
  // and mark the positions that need no engine call.
  const moveInfo: MoveInfo[] = [];
  const replay = new Chess(fens[0]);
  positions[0] = detectTerminal(replay);
  for (let i = 0; i < sanMoves.length; i++) {
    const m = replay.move(sanMoves[i]!);
    moveInfo.push({ color: m.color, san: m.san, uci: m.lan });
    positions[i + 1] = detectTerminal(replay);
  }

  const moves: AnalyzedMove[] = [];
  let nextMove = 0;
  const flush = () => {
    while (nextMove < sanMoves.length) {
      const before = positions[nextMove];
      const after = positions[nextMove + 1];
      if (!before || !after) break;
      const move = buildAnalyzedMove(moveInfo[nextMove]!, fens[nextMove]!, fens[nextMove + 1]!, before, after);
      moves.push(move);
      onMove?.(move, nextMove);
      nextMove++;
    }
  };
  flush();

  const queue: number[] = [];
  positions.forEach((p, i) => { if (!p) queue.push(i); });

  if (queue.length > 0) {
    onStage?.('loading-engine');
    await pool.ready();
    throwIfAborted(signal);
    onStage?.('analyzing');

    let cursor = 0;
    const lastIndex = total - 1;
    const singlePosition = total === 1;

    const worker = async (engine: Engine) => {
      for (;;) {
        throwIfAborted(signal);
        const q = cursor++;
        if (q >= queue.length) return;
        const idx = queue[q]!;
        // The final position has no move after it, so the runner-up line is
        // useless there — except in single-position (FEN) mode.
        const multiPv = singlePosition ? MULTI_PV_POSITION : idx === lastIndex ? 1 : MULTI_PV_GAME;
        const result = await engine.analyze(fens[idx]!, depth, multiPv);
        throwIfAborted(signal);
        positions[idx] = toPositionAnalysis(result);
        flush();
      }
    };

    await Promise.all(pool.engines.slice(0, queue.length).map(worker));
  }

  throwIfAborted(signal);
  return { moves, lastPosition: positions[total - 1]! };
}
