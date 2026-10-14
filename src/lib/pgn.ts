import { Chess } from 'chess.js';
import type { PgnMetadata } from './types';
import type { Platform } from './accounts';

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

export interface TimeControl {
  initial: number;   // seconds
  increment: number; // seconds
}

export interface PgnClockInfo {
  /** Clock left after each ply, in seconds (`[%clk]` comments); null when missing or incomplete. */
  clocks: number[] | null;
  /** Parsed `[TimeControl "180+2"]`; null for daily / unknown time controls. */
  timeControl: TimeControl | null;
  /** Where the game was played, from the `[Site]` header. */
  platform: Platform | null;
  /** Speed class from the time control (Lichess bands), null when unknown. */
  speed: Speed | null;
}

export type Speed = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';

/** Lichess speed bands on the estimated game length: initial + 40 × increment. */
export function speedOf(tc: string | undefined): Speed | null {
  if (!tc) return null;
  if (/^\d+\/\d+$/.test(tc)) return 'daily'; // "1/86400" = one move per day
  const parsed = parseTimeControl(tc);
  if (!parsed) return null;
  const est = parsed.initial + 40 * parsed.increment;
  return est < 179 ? 'bullet' : est < 479 ? 'blitz' : est < 1499 ? 'rapid' : 'classical';
}

function pgnHeader(pgn: string, name: string): string | undefined {
  return new RegExp(`\\[\\s*${name}\\s+"([^"]*)"\\s*\\]`, 'i').exec(pgn)?.[1]?.trim();
}

/** "180+2" → { initial: 180, increment: 2 }; "600" → { 600, 0 }; "-", "1/86400" → null. */
export function parseTimeControl(tc: string | undefined): TimeControl | null {
  const m = tc ? /^(\d+)(?:\+(\d+))?$/.exec(tc) : null;
  if (!m) return null;
  const initial = Number(m[1]);
  return initial > 0 ? { initial, increment: Number(m[2] ?? 0) } : null;
}

/**
 * Clock data and origin of a game. Lichess (with clocks) and Chess.com PGNs
 * carry one `[%clk h:mm:ss(.f)]` comment per ply; anything else yields null clocks.
 * `plies` is the number of moves in the game, used to reject partial clock data.
 */
export function parseClockInfo(pgn: string, plies: number): PgnClockInfo {
  const site = (pgnHeader(pgn, 'Site') ?? '').toLowerCase();
  const platform = site.includes('lichess.org') ? 'lichess' : site.includes('chess.com') ? 'chesscom' : null;
  const tcHeader = pgnHeader(pgn, 'TimeControl');
  const timeControl = parseTimeControl(tcHeader);

  const movetext = pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, '');
  const clocks = [...movetext.matchAll(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g)].map(
    (m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]),
  );
  return {
    clocks: plies > 0 && clocks.length === plies ? clocks : null,
    timeControl,
    platform,
    speed: speedOf(tcHeader),
  };
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
