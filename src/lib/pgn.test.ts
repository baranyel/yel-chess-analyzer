import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { parseFen, parsePgn } from './pgn';
import { uciToSan } from './chessUtils';

describe('parsePgn', () => {
  it('parses moves, headers and one FEN per position', () => {
    const r = parsePgn(`[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0`);
    expect(r.moves).toEqual(['e4', 'e5', 'Nf3']);
    expect(r.fens).toHaveLength(4);
    expect(r.metadata.white).toBe('A');
    expect(r.metadata.result).toBe('1-0');
  });

  it('falls back to friendly names when the tags are missing (chess.js reports them as "?")', () => {
    const r = parsePgn('1. d4 d5');
    expect(r.metadata.white).toBe('White');
    expect(r.metadata.black).toBe('Black');
    expect(r.metadata.event).toBe('Unknown Event');
  });

  it('throws on garbage input', () => {
    expect(() => parsePgn('this is not a pgn')).toThrow();
  });

  it('throws when there are no moves', () => {
    expect(() => parsePgn('[White "A"]\n[Black "B"]\n\n*')).toThrow();
  });

  it('loads a game that starts from a [FEN] header position', () => {
    const r = parsePgn(
      `[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 2. e5 *`,
    );
    expect(r.moves).toEqual(['e4', 'Kd7', 'e5']);
    expect(r.fens).toHaveLength(4);
    expect(r.fens[0]).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  });

  it('supports a game where Black moves first', () => {
    const r = parsePgn(
      `[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1"]\n\n1... Kd7 2. e4 *`,
    );
    expect(r.moves).toEqual(['Kd7', 'e4']);
    expect(r.fens[0]!.split(' ')[1]).toBe('b');
  });

  it('keeps the FEN list aligned with the moves', () => {
    const r = parsePgn('1. e4 e5 2. Nf3');
    const c = new Chess();
    expect(r.fens[0]).toBe(c.fen());
    c.move('e4');
    expect(r.fens[1]).toBe(c.fen());
    c.move('e5');
    c.move('Nf3');
    expect(r.fens[3]).toBe(c.fen());
    expect(r.fens).toHaveLength(r.moves.length + 1);
  });

  it('rejects unsupported variants with a clear message', () => {
    const chess960 = `[Variant "Chess960"]\n[FEN "bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HFhf - 0 1"]\n\n1. e4 e5 *`;
    expect(() => parsePgn(chess960)).toThrow(/Chess960.*desteklenmiyor/);
    expect(() => parsePgn(`[Variant "Atomic"]\n\n1. e4 e5 *`)).toThrow(/Atomic/);
  });

  it('accepts the standard / from-position variants', () => {
    expect(() => parsePgn(`[Variant "Standard"]\n\n1. e4 e5 *`)).not.toThrow();
    expect(() => parsePgn(`[Variant "From Position"]\n\n1. e4 e5 *`)).not.toThrow();
  });
});

describe('parseFen', () => {
  it('returns a single position and no moves', () => {
    const r = parseFen('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    expect(r.moves).toHaveLength(0);
    expect(r.fens).toHaveLength(1);
  });

  it('throws on an invalid FEN', () => {
    expect(() => parseFen('not a fen')).toThrow();
  });
});

describe('uciToSan', () => {
  const START = new Chess().fen();

  it('converts a normal move and a capture/check', () => {
    expect(uciToSan(START, 'e2e4')).toBe('e4');
    expect(uciToSan(START, 'g1f3')).toBe('Nf3');
  });

  it('handles promotion and castling', () => {
    expect(uciToSan('8/4P3/8/8/8/8/k7/4K3 w - - 0 1', 'e7e8q')).toBe('e8=Q');
    expect(uciToSan('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')).toBe('O-O');
  });

  it('falls back to the raw UCI text for an illegal or malformed move', () => {
    expect(uciToSan(START, 'e2e5')).toBe('e2e5');
    expect(uciToSan(START, 'xx')).toBe('xx');
  });
});
