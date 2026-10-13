import { describe, expect, it } from 'vitest';
import { badgePosition, defaultOrientation, squareToOffset } from './orientation';
import { uciSquares } from './chessUtils';
import { splitPgnGames } from './pgn';
import type { PgnMetadata } from './types';

const meta = (white: string, black: string): PgnMetadata =>
  ({ white, black, event: 'e', date: 'd', result: '*' });

describe('defaultOrientation', () => {
  it('flips the board when the viewer played Black', () => {
    expect(defaultOrientation(meta('Ann', 'Bob'), ['bob'])).toBe('black');
    expect(defaultOrientation(meta('Ann', 'Bob'), [undefined, '  BOB '])).toBe('black');
  });

  it('keeps White at the bottom otherwise', () => {
    expect(defaultOrientation(meta('Ann', 'Bob'), ['ann'])).toBe('white');
    expect(defaultOrientation(meta('Ann', 'Bob'), ['carl'])).toBe('white');
    expect(defaultOrientation(meta('Ann', 'Bob'), [])).toBe('white');
    expect(defaultOrientation(null, ['bob'])).toBe('white');
  });

  it('does not flip when both names match (playing yourself)', () => {
    expect(defaultOrientation(meta('Ann', 'Ann'), ['ann'])).toBe('white');
  });
});

describe('squareToOffset', () => {
  it('white at the bottom: a8 is top-left, h1 is bottom-right', () => {
    expect(squareToOffset('a8', 800, 'white')).toEqual({ x: 0, y: 0 });
    expect(squareToOffset('h1', 800, 'white')).toEqual({ x: 700, y: 700 });
  });

  it('black at the bottom: the board is rotated 180°', () => {
    expect(squareToOffset('a8', 800, 'black')).toEqual({ x: 700, y: 700 });
    expect(squareToOffset('h1', 800, 'black')).toEqual({ x: 0, y: 0 });
    expect(squareToOffset('e4', 800, 'black')).toEqual({ x: 300, y: 300 });
  });
});

describe('badgePosition', () => {
  const size = 800;
  const badge = 38;

  it('always stays inside the board, in both orientations', () => {
    for (const orientation of ['white', 'black'] as const) {
      for (const file of 'abcdefgh') {
        for (const rank of '12345678') {
          const { left, top } = badgePosition(file + rank, size, orientation, badge);
          expect(left).toBeGreaterThanOrEqual(0);
          expect(top).toBeGreaterThanOrEqual(0);
          expect(left + badge).toBeLessThanOrEqual(size);
          expect(top + badge).toBeLessThanOrEqual(size);
        }
      }
    }
  });

  it('sits on the top-right corner of an interior square', () => {
    const { x, y } = squareToOffset('e4', size, 'white');
    const { left, top } = badgePosition('e4', size, 'white', badge);
    expect(left).toBeGreaterThan(x + 50);   // right half of the 100px square
    expect(top).toBeLessThan(y + 20);       // top edge
  });
});

describe('uciSquares', () => {
  it('splits a UCI move and ignores the promotion piece', () => {
    expect(uciSquares('e2e4')).toEqual({ from: 'e2', to: 'e4' });
    expect(uciSquares('e7e8q')).toEqual({ from: 'e7', to: 'e8' });
  });

  it('rejects anything that is not a UCI move', () => {
    expect(uciSquares('')).toBeNull();
    expect(uciSquares(null)).toBeNull();
    expect(uciSquares('(none)')).toBeNull();
    expect(uciSquares('e2')).toBeNull();
  });
});

describe('splitPgnGames', () => {
  const g = (n: number) => `[Event "G${n}"]\n[White "a"]\n[Black "b"]\n\n1. e4 e5 *`;

  it('splits a multi-game file at each [Event header', () => {
    const games = splitPgnGames(`${g(1)}\n\n${g(2)}\r\n\r\n${g(3)}`);
    expect(games).toHaveLength(3);
    expect(games[1]).toContain('G2');
    expect(games[0]).not.toContain('G2');
  });

  it('does not split a single game on the blank line between headers and moves', () => {
    expect(splitPgnGames(g(1))).toHaveLength(1);
  });

  it('returns plain movetext and strips a BOM', () => {
    expect(splitPgnGames('1. e4 e5')).toEqual(['1. e4 e5']);
    expect(splitPgnGames('﻿' + g(1))[0]!.startsWith('[Event')).toBe(true);
  });
});
