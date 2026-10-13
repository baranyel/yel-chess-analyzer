import type { AnalysisRecord } from '../lib/analysisHistory';
import { buildSummary } from '../lib/summary';
import type { AnalyzedMove } from '../lib/types';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** n fake-but-well-formed moves; FENs are unique per ply so size is realistic. */
export function makeMoves(n: number): AnalyzedMove[] {
  return Array.from({ length: n }, (_, i) => ({
    moveNumber: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? 'w' : 'b',
    san: 'Nf3',
    uci: 'g1f3',
    fenBefore: `${START_FEN} ${i}`,
    fenAfter: `${START_FEN} ${i + 1}`,
    evalBefore: { type: 'cp', value: 20 },
    evalAfter: { type: 'cp', value: 10 },
    bestMove: 'e2e4',
    alternatives: ['d2d4'],
    alternativeEvals: [{ type: 'cp', value: 5 }],
    classification: 'good',
    cpLoss: 10,
  }));
}

export function makeRecord(gameId: string, opts: { plies?: number; depth?: number; analyzedAt?: number } = {}): AnalysisRecord {
  const plies = opts.plies ?? 40;
  const moves = makeMoves(plies);
  const fens = [moves[0]!.fenBefore, ...moves.map((m) => m.fenAfter)];
  return {
    gameId,
    pgn: `[White "a"]\n[Black "b"]\n\n1. Nf3 *  ${gameId}`,
    analyzedAt: opts.analyzedAt ?? Date.now(),
    depth: opts.depth ?? 18,
    engineId: 'stockfish-18',
    moves,
    summary: buildSummary(moves),
    fens,
    sanMoves: moves.map((m) => m.san),
    metadata: { white: 'a', black: 'b', event: 'e', date: '2026.01.01', result: '*' },
  };
}
