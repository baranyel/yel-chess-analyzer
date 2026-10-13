import { describe, expect, it } from 'vitest';
import { parseFen, parsePgn } from './pgn';

describe('parsePgn', () => {
  it('parses moves, headers and one FEN per position', () => {
    const r = parsePgn(`[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0`);
    expect(r.moves).toEqual(['e4', 'e5', 'Nf3']);
    expect(r.fens).toHaveLength(4);
    expect(r.metadata.white).toBe('A');
    expect(r.metadata.result).toBe('1-0');
  });

  it('throws on garbage input', () => {
    expect(() => parsePgn('this is not a pgn')).toThrow();
  });

  it('throws when there are no moves', () => {
    expect(() => parsePgn('[White "A"]\n[Black "B"]\n\n*')).toThrow();
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
