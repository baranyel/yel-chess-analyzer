import { Chess } from 'chess.js';
import type { PgnMetadata } from './types';

export interface ParsedGame {
  metadata: PgnMetadata;
  moves: string[];   // array of SAN moves
  fens: string[];    // fen[0] = start, fen[i] = position after move i-1
}

// chess.js only implements the standard rules. "From Position" is standard
// chess started from a FEN, so it is fine; Chess960, Atomic, Crazyhouse… are not.
const SUPPORTED_VARIANTS = new Set(['standard', 'chess', 'from position', 'fromposition']);

/** Returns the variant name when the PGN declares an unsupported one, else null. */
function unsupportedVariant(pgn: string): string | null {
  const match = /\[\s*Variant\s+"([^"]*)"\s*\]/i.exec(pgn);
  const variant = match?.[1]?.trim();
  if (!variant) return null;
  return SUPPORTED_VARIANTS.has(variant.toLowerCase()) ? null : variant;
}

export function parsePgn(pgn: string): ParsedGame {
  const text = pgn.trim();

  const variant = unsupportedVariant(text);
  if (variant) {
    throw new Error(`Bu varyant (${variant}) desteklenmiyor; yalnızca standart satranç analiz edilebilir.`);
  }

  const chess = new Chess();

  // chess.js loadPgn returns void and throws on error. It also honours a
  // [SetUp]/[FEN] header, so games from custom start positions load correctly.
  try {
    chess.loadPgn(text, { strict: false });
  } catch {
    throw new Error('Geçersiz PGN — ayrıştırılamadı.');
  }

  const history = chess.history({ verbose: true });
  if (history.length === 0) {
    throw new Error('PGN hiç hamle içermiyor.');
  }

  // chess.js fills missing tags with PGN's "unknown" placeholder "?".
  const known = (value: string | null | undefined, fallback: string) =>
    !value || value === '?' ? fallback : value;

  const headers = chess.header();
  const metadata: PgnMetadata = {
    white:   known(headers['White'], 'White'),
    black:   known(headers['Black'], 'Black'),
    event:   known(headers['Event'], 'Unknown Event'),
    date:    headers['Date']   ?? '????.??.??',
    result:  headers['Result'] ?? '*',
    whiteElo: headers['WhiteElo'] ?? undefined,
    blackElo: headers['BlackElo'] ?? undefined,
  };

  // Every move records the position before and after it, so the FEN list never
  // has to be rebuilt by replaying from the standard start position.
  const fens: string[] = [history[0]!.before, ...history.map((m) => m.after)];
  const moves: string[] = history.map((m) => m.san);

  return { metadata, moves, fens };
}

/**
 * A .pgn file may hold many games. Splits on the blank line that precedes each
 * new `[Event …]` header; text without such a boundary is returned as one game.
 */
export function splitPgnGames(text: string): string[] {
  const games = text
    .replace(/^﻿/, '')
    .split(/\r?\n[ \t]*\r?\n(?=\[Event\s)/)
    .map((g) => g.trim())
    .filter(Boolean);
  return games.length > 0 ? games : [text.trim()];
}

export function parseFen(fen: string): ParsedGame {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    throw new Error('Geçersiz FEN — pozisyon okunamadı.');
  }
  return {
    metadata: { white: 'White', black: 'Black', event: 'FEN Position', date: '????.??.??', result: '*' },
    moves: [],
    fens: [chess.fen()],
  };
}
