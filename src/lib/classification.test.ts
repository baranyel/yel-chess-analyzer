import { describe, expect, it } from 'vitest';
import {
  CP_CLAMP,
  classifyMove,
  clampedCp,
  computeAcpl,
  computeCpLoss,
  computeWinPctLoss,
  cpToWinPct,
  estimateElo,
} from './classification';
import type { EvalResult } from './types';

const cp = (value: number): EvalResult => ({ type: 'cp', value });
const mate = (value: number): EvalResult => ({ type: 'mate', value });

describe('clampedCp', () => {
  it('clamps centipawns and mate scores to ±CP_CLAMP', () => {
    expect(clampedCp(cp(250))).toBe(250);
    expect(clampedCp(cp(5000))).toBe(CP_CLAMP);
    expect(clampedCp(cp(-5000))).toBe(-CP_CLAMP);
    expect(clampedCp(mate(3))).toBe(CP_CLAMP);
    expect(clampedCp(mate(-2))).toBe(-CP_CLAMP);
  });
});

describe('computeCpLoss', () => {
  it('does not count a missed mate as a 9 500 cp loss', () => {
    // M3 -> +5.00 for white: 1000 - 500
    expect(computeCpLoss(mate(3), cp(500), 'w')).toBe(500);
  });

  it('caps the loss inside already-decided positions', () => {
    // +20.00 -> +8.00 is 1200 raw cp, but both sides are past the clamp
    expect(computeCpLoss(cp(2000), cp(800), 'w')).toBe(200);
    expect(computeCpLoss(cp(2000), cp(1500), 'w')).toBe(0);
  });

  it('never returns a negative loss', () => {
    expect(computeCpLoss(cp(100), cp(300), 'w')).toBe(0);
  });

  it('works from black\'s point of view (evals are white-POV)', () => {
    // Black was at -300 (good for black) and moved to -100 -> lost 200
    expect(computeCpLoss(cp(-300), cp(-100), 'b')).toBe(200);
  });
});

describe('ACPL / Elo estimate', () => {
  it('a single missed mate no longer destroys an otherwise perfect game', () => {
    const loss = computeCpLoss(mate(3), cp(500), 'w');
    const moves = Array.from({ length: 40 }, (_, i) => ({ cpLoss: i === 20 ? loss : 0 }));
    const acpl = computeAcpl(moves);
    expect(acpl).toBeLessThan(20);
    expect(estimateElo(acpl)).toBeGreaterThan(2000);
  });

  it('is monotonic: more loss never gives a higher Elo', () => {
    expect(estimateElo(10)).toBeGreaterThan(estimateElo(50));
    expect(estimateElo(50)).toBeGreaterThan(estimateElo(150));
  });

  it('returns 0 ACPL for an empty move list', () => {
    expect(computeAcpl([])).toBe(0);
  });
});

describe('win probability', () => {
  it('is 50% at 0 cp and symmetric', () => {
    expect(cpToWinPct(0)).toBeCloseTo(50, 5);
    expect(cpToWinPct(300) + cpToWinPct(-300)).toBeCloseTo(100, 5);
  });

  it('computeWinPctLoss is mover-relative and non-negative', () => {
    expect(computeWinPctLoss(cp(0), cp(-300), 'w')).toBeGreaterThan(0);
    expect(computeWinPctLoss(cp(0), cp(300), 'b')).toBeGreaterThan(0);
    expect(computeWinPctLoss(cp(0), cp(300), 'w')).toBe(0);
  });

  it('a decided position loses almost no win% for a non-losing slip', () => {
    expect(computeWinPctLoss(cp(2000), cp(800), 'w')).toBeLessThan(5);
  });
});

describe('classifyMove', () => {
  it('returns unknown when there is no best move', () => {
    expect(classifyMove(0, 0, 'e2e4', null)).toBe('unknown');
  });

  it('labels the engine move as best/kusursuz/muhtesem depending on the 2nd best', () => {
    expect(classifyMove(0, 3, 'e2e4', 'e2e4')).toBe('best');
    expect(classifyMove(0, 12, 'e2e4', 'e2e4')).toBe('muhtesem');
    expect(classifyMove(0, 25, 'e2e4', 'e2e4')).toBe('kusursuz');
  });

  it('does not treat an under-promotion as the best (queen) promotion', () => {
    expect(classifyMove(30, 50, 'e7e8n', 'e7e8q')).toBe('blunder');
    expect(classifyMove(0, 3, 'e7e8q', 'e7e8q')).toBe('best');
  });

  it('classifies non-best moves by win% loss thresholds', () => {
    expect(classifyMove(1, 50, 'a2a3', 'e2e4')).toBe('excellent');
    expect(classifyMove(4, 50, 'a2a3', 'e2e4')).toBe('good');
    expect(classifyMove(8, 50, 'a2a3', 'e2e4')).toBe('inaccuracy');
    expect(classifyMove(15, 50, 'a2a3', 'e2e4')).toBe('mistake');
    expect(classifyMove(40, 50, 'a2a3', 'e2e4')).toBe('blunder');
  });
});
