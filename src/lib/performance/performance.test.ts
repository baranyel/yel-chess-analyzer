import { describe, expect, it } from 'vitest';
// The calibration script's implementation; the app must compute the same numbers.
// @ts-expect-error — plain JS module without types
import { gameTimeFeatures } from '../../../scripts/calibrate/lib.mjs';
import { estimatePerformance, headlineEstimate, moveQualityEstimates, performanceRating, type GameEvidence } from './estimate';
import { isScored, moveAccuracy, type MoveFeature } from './moves';
import { chesscomToLichess, hasConversion, lichessToChesscom, scaleSpeed } from './scale';
import { gameTimeIndicators, timeManagement, type GameTimeInput } from './timeManagement';

/** Deterministic pseudo-random numbers. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

/** One side's moves of a 60-ply game; `loss` sets how bad the moves are. */
function sideFeatures(color: 'w' | 'b', loss: number, seed = 1): MoveFeature[] {
  const r = rng(seed);
  return Array.from({ length: 30 }, (_, i) => {
    const before = Math.round((r() - 0.5) * 300);
    const winLoss = r() < 0.5 ? 0 : r() * loss;
    return { ply: i * 2 + (color === 'b' ? 1 : 0), forced: false, before, after: before - winLoss * 8, winLoss };
  });
}

const game = (loss: number, seed: number, extra: Partial<GameEvidence> = {}): GameEvidence =>
  ({ features: sideFeatures('w', loss, seed), ...extra });

describe('move filter', () => {
  it('skips book, forced and decided-position moves', () => {
    const base: MoveFeature = { ply: 20, forced: false, before: 0, after: 0, winLoss: 0 };
    expect(isScored(base)).toBe(true);
    expect(isScored({ ...base, ply: 5 })).toBe(false);
    expect(isScored({ ...base, forced: true })).toBe(false);
    expect(isScored({ ...base, before: 650 })).toBe(false);
    expect(isScored({ ...base, before: -650 })).toBe(false);
  });

  it('uses the Lichess per-move accuracy curve', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(moveAccuracy(10)).toBeCloseTo(63.9, 0);
  });
});

describe('performance rating (results)', () => {
  it('is the opponents’ average for an even score', () => {
    expect(performanceRating([{ opponentRating: 1500, score: 1 }, { opponentRating: 1500, score: 0 }])).toBeCloseTo(1500);
  });

  it('uses a half-point smoothing, so a single win is not +∞', () => {
    expect(performanceRating([{ opponentRating: 1500, score: 1 }])).toBeCloseTo(1500 + 400 * Math.log10(3));
  });
});

describe('estimatePerformance', () => {
  it('rates better play higher', () => {
    const good = moveQualityEstimates(sideFeatures('w', 4), 1)!.accuracy.rating;
    const bad = moveQualityEstimates(sideFeatures('w', 40), 1)!.accuracy.rating;
    expect(good).toBeGreaterThan(bad);
  });

  it('narrows the interval as games are added', () => {
    const one = estimatePerformance([game(10, 1)], 'lichess').accuracy!;
    const many = estimatePerformance(Array.from({ length: 15 }, (_, i) => game(10, i + 1)), 'lichess').accuracy!;
    expect(many.high - many.low).toBeLessThan(one.high - one.low);
  });

  it('returns no move-quality estimate with too few scored moves', () => {
    const p = estimatePerformance([{ features: sideFeatures('w', 10).slice(0, 4) }], null);
    expect(p.accuracy).toBeNull();
    expect(headlineEstimate(p)).toBeNull();
  });

  it('combines on the Lichess scale and converts accuracy to the Chess.com scale', () => {
    const games = (speed: string) => Array.from({ length: 10 }, (_, i) =>
      game(10, i + 1, { opponentRating: 1500, playerRating: 1500, score: i % 2, speed }));

    const lichess = estimatePerformance(games('blitz'), 'lichess');
    expect(lichess.combined).not.toBeNull();
    expect(lichess.combined!.rating).toBeGreaterThanOrEqual(Math.min(lichess.accuracy!.rating, lichess.results!.rating));
    expect(lichess.combined!.rating).toBeLessThanOrEqual(Math.max(lichess.accuracy!.rating, lichess.results!.rating));
    expect(headlineEstimate(lichess)!.method).toBe('combined');
    expect(lichess.combined!.equivalent!.scale).toBe('chesscom');

    const chesscom = estimatePerformance(games('blitz'), 'chesscom');
    expect(chesscom.accuracy!.scale).toBe('chesscom');
    expect(chesscom.accuracy!.equivalent).toEqual({ scale: 'lichess', rating: lichess.accuracy!.rating });
    // the conversion's own uncertainty widens the interval
    expect(chesscom.accuracy!.error).toBeGreaterThan(0);
    expect(chesscom.combined!.scale).toBe('chesscom');
    expect(chesscom.results!.equivalent!.scale).toBe('lichess');
    expect(chesscom.playerRatingLichess).toBe(chesscomToLichess(1500, 'blitz')!.rating);

    // without a known speed there is no table to convert with
    const unknownSpeed = estimatePerformance(games(''), 'chesscom');
    expect(unknownSpeed.accuracy!.scale).toBe('lichess');
    expect(unknownSpeed.combined).toBeNull();
    expect(headlineEstimate(unknownSpeed)!.method).toBe('results');
  });

  it('flags results that disagree with the quality of play', () => {
    const games = Array.from({ length: 15 }, (_, i) =>
      game(40, i + 1, { opponentRating: 2400, score: 1 })); // weak moves, yet beat 2400s every time
    expect(estimatePerformance(games, 'lichess').disagreement).toBe(true);
  });
});

describe('time management', () => {
  /** A 60-ply game where white spends `think` seconds per move in a 180+0 game. */
  function timedGame(think: number, seed = 1): GameTimeInput {
    const r = rng(seed);
    const features = sideFeatures('w', 15, seed);
    const clocks: number[] = [];
    let w = 180, b = 180;
    for (let ply = 0; ply < 60; ply++) {
      if (ply % 2 === 0) w = Math.max(0.1, w - think * (0.2 + r() * 1.6));
      else b = Math.max(0.1, b - 3);
      clocks.push(+(ply % 2 === 0 ? w : b).toFixed(1));
    }
    return { features, clocks, timeControl: { initial: 180, increment: 0 } };
  }

  it('matches the calibration script indicator for indicator', () => {
    for (const think of [0.8, 3, 8]) {
      const g = timedGame(think, Math.round(think * 10));
      const ts = gameTimeIndicators(g)!;
      const js = gameTimeFeatures(
        { clocks: g.clocks, init: 180, inc: 0, white: true },
        g.features.map((f) => ({ ply: f.ply, forced: f.forced ? 1 : 0, before: f.before, after: f.after, wl: f.winLoss })),
      );
      for (const k of Object.keys(js) as Array<keyof typeof ts>) {
        if (Number.isNaN(js[k])) expect(ts[k]).toBeNaN();
        else expect(ts[k]).toBeCloseTo(js[k], 10);
      }
    }
  });

  it('notices time trouble', () => {
    const calm = gameTimeIndicators(timedGame(2))!;
    const rushed = gameTimeIndicators(timedGame(8))!;
    expect(rushed.lowFrac).toBeGreaterThan(calm.lowFrac);
  });

  it('scores 0–100 against the rating band, and is null without usable clocks', () => {
    const t = timeManagement([timedGame(3), timedGame(4, 2)], 1500)!;
    expect(t.score).toBeGreaterThanOrEqual(0);
    expect(t.score).toBeLessThanOrEqual(100);
    expect(t.band).toBe('1200–1600');
    expect(t.reliable).toBe(false);
    expect(timeManagement([{ ...timedGame(3), clocks: [] }], 1500)).toBeNull();
  });
});

describe('site conversion', () => {
  it('has measured tables for blitz and rapid', () => {
    expect(hasConversion('blitz')).toBe(true);
    expect(hasConversion('rapid')).toBe(true);
    expect(scaleSpeed('classical')).toBe('rapid');
    expect(scaleSpeed('bullet')).toBeNull();
  });

  it('is increasing and round-trips', () => {
    for (const speed of ['blitz', 'rapid'] as const) {
      let prev = -Infinity;
      for (let r = 600; r <= 2300; r += 100) {
        const li = chesscomToLichess(r, speed)!;
        expect(li.rating).toBeGreaterThan(prev);
        prev = li.rating;
        expect(Math.abs(lichessToChesscom(li.rating, speed)!.rating - r)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('carries the end offset beyond the measured range and says so', () => {
    const far = chesscomToLichess(3200, 'blitz')!;
    expect(far.extrapolated).toBe(true);
    expect(chesscomToLichess(1500, 'blitz')!.extrapolated).toBe(false);
  });
});
