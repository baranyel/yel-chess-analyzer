import { Chess } from 'chess.js';
import type { PgnMetadata } from './types';

export interface ParsedGame {
  metadata: PgnMetadata;
  moves: string[];   // array of SAN moves
  fens: string[];    // fen[0] = start, fen[i] = position after move i-1
}

export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess();

  // chess.js loadPgn returns void and throws on error
  try {
    chess.loadPgn(pgn.trim(), { strict: false });
  } catch {
    throw new Error('Invalid PGN — could not parse.');
  }

  const history = chess.history({ verbose: true });
  if (history.length === 0) {
    throw new Error('PGN contains no moves.');
  }

  const headers = chess.header();
  const metadata: PgnMetadata = {
    white:   headers['White']  ?? 'White',
    black:   headers['Black']  ?? 'Black',
    event:   headers['Event']  ?? 'Unknown Event',
    date:    headers['Date']   ?? '????.??.??',
    result:  headers['Result'] ?? '*',
    whiteElo: headers['WhiteElo'] ?? undefined,
    blackElo: headers['BlackElo'] ?? undefined,
  };

  // Rebuild FEN list by replaying from scratch
  const replayChess = new Chess();
  const fens: string[] = [replayChess.fen()];
  const moves: string[] = [];

  for (const move of history) {
    replayChess.move(move.san);
    fens.push(replayChess.fen());
    moves.push(move.san);
  }

  return { metadata, moves, fens };
}

export function parseFen(fen: string): ParsedGame {
  const chess = new Chess(fen);
  return {
    metadata: { white: 'White', black: 'Black', event: 'FEN Position', date: '????.??.??', result: '*' },
    moves: [],
    fens: [chess.fen()],
  };
}
