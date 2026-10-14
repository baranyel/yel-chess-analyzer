import { describe, expect, it } from 'vitest';
import { buildPlayerStats, buildSummary, scoreFromResult } from './summary';
import type { AnalyzedMove, MoveClassification } from './types';

function move(color: 'w' | 'b', classification: MoveClassification, cpLoss = 0): AnalyzedMove {
  return {
    moveNumber: 1, color, san: 'e4', uci: 'e2e4', fenBefore: '', fenAfter: '',
    evalBefore: null, evalAfter: null, bestMove: null, alternatives: [], alternativeEvals: [],
    classification, cpLoss,
  };
}

describe('buildPlayerStats', () => {
  it('returns all zeros for a player with no moves (no phantom 2900 Elo)', () => {
    const s = buildPlayerStats([]);
    expect(s.accuracy).toBe(0);
    expect(s.estimatedElo).toBe(0);
    expect(s.blunder).toBe(0);
  });

  it('counts classifications and derives ACPL', () => {
    const s = buildPlayerStats([move('w', 'best'), move('w', 'blunder', 300), move('w', 'good', 30)]);
    expect(s.best).toBe(1);
    expect(s.blunder).toBe(1);
    expect(s.good).toBe(1);
    expect(s.acpl).toBe(110);
  });
});

describe('buildSummary', () => {
  it('splits moves by colour', () => {
    const s = buildSummary([move('w', 'best'), move('b', 'blunder', 400), move('w', 'best')]);
    expect(s.white.best).toBe(2);
    expect(s.black.blunder).toBe(1);
    expect(s.black.best).toBe(0);
  });
});

describe('scoreFromResult', () => {
  it('maps PGN results to the player’s score', () => {
    expect(scoreFromResult('1-0', 'w')).toBe(1);
    expect(scoreFromResult('1-0', 'b')).toBe(0);
    expect(scoreFromResult('1/2-1/2', 'b')).toBe(0.5);
    expect(scoreFromResult('½-½', 'w')).toBe(0.5);
    expect(scoreFromResult('*', 'w')).toBeNull();
  });
});
