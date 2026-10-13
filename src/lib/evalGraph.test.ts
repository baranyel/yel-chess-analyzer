import { describe, expect, it } from 'vitest';
import { evalGraphGeometry, indexAtX } from './evalGraph';
import { makeMoves } from '../test/fixtures';
import type { AnalyzedMove, EvalResult } from './types';

const withEvals = (n: number, evals: EvalResult[]): AnalyzedMove[] =>
  makeMoves(n).map((m, i) => ({ ...m, evalBefore: evals[i] ?? null, evalAfter: evals[i + 1] ?? null }));

const cp = (value: number): EvalResult => ({ type: 'cp', value });

describe('evalGraphGeometry', () => {
  it('returns nothing without analysed moves', () => {
    expect(evalGraphGeometry([], 200, 60).points).toEqual([]);
    expect(evalGraphGeometry(makeMoves(3).map((m) => ({ ...m, evalBefore: null, evalAfter: null })), 200, 60).points).toEqual([]);
  });

  it('has one point per position, spread across the full width', () => {
    const g = evalGraphGeometry(withEvals(4, [cp(0), cp(0), cp(0), cp(0), cp(0)]), 200, 60);
    expect(g.points).toHaveLength(5);
    expect(g.points[0]!.x).toBe(0);
    expect(g.points[4]!.x).toBe(200);
    expect(g.points[2]!.x).toBe(100);
  });

  it('puts White-winning positions high and Black-winning ones low; equal is the middle', () => {
    const g = evalGraphGeometry(withEvals(3, [cp(0), cp(600), cp(-600), cp(0)]), 120, 100);
    const [even, white, black] = g.points;
    expect(even!.y).toBeCloseTo(50, 5);
    expect(white!.y).toBeLessThan(25);
    expect(black!.y).toBeGreaterThan(75);
  });

  it('treats a mate like a decided position without breaking the scale', () => {
    const g = evalGraphGeometry(withEvals(2, [cp(0), { type: 'mate', value: 2 }, { type: 'mate', value: -1 }]), 100, 100);
    expect(g.points[1]!.y).toBeLessThan(1);
    expect(g.points[2]!.y).toBeGreaterThan(99);
  });

  it('carries the classification of the move that led to each position', () => {
    const moves = withEvals(2, [cp(0), cp(0), cp(0)]);
    moves[1] = { ...moves[1]!, classification: 'blunder' };
    const g = evalGraphGeometry(moves, 100, 50);
    expect(g.points.map((p) => p.classification)).toEqual([null, 'good', 'blunder']);
  });

  it('draws a stepped line and closes the area at the bottom', () => {
    const g = evalGraphGeometry(withEvals(2, [cp(0), cp(100), cp(100)]), 100, 50);
    expect(g.linePath.startsWith('M0 25')).toBe(true);
    expect(g.linePath).toMatch(/H50 V/);        // horizontal then vertical = step
    expect(g.areaPath.endsWith('Z')).toBe(true);
    expect(g.areaPath).toContain('V50');        // down to the bottom edge
  });

  it('skips a missing evaluation instead of inventing one', () => {
    const moves = withEvals(3, [cp(0), cp(50), cp(50), cp(50)]);
    moves[1] = { ...moves[1]!, evalAfter: null };
    const g = evalGraphGeometry(moves, 90, 40);
    expect(g.points.map((p) => p.index)).toEqual([0, 1, 3]);
  });
});

describe('indexAtX', () => {
  it('maps a click to the nearest position and clamps to the ends', () => {
    expect(indexAtX(0, 200, 10)).toBe(0);
    expect(indexAtX(100, 200, 10)).toBe(5);
    expect(indexAtX(199, 200, 10)).toBe(10);
    expect(indexAtX(-20, 200, 10)).toBe(0);
    expect(indexAtX(900, 200, 10)).toBe(10);
  });

  it('is 0 when there is nothing to pick', () => {
    expect(indexAtX(50, 200, 0)).toBe(0);
    expect(indexAtX(50, 0, 10)).toBe(0);
  });
});
