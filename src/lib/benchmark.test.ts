import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/memoryStorage';
import { makeMoves } from '../test/fixtures';
import { buildSummary } from './summary';
import { computeConsistency, loadAllRuns, saveRun, type BenchmarkRun } from './benchmark';

beforeEach(() => { installMemoryStorage(); });
afterEach(() => { vi.unstubAllGlobals(); });

function runInput(n = 40, overrides: Partial<Omit<BenchmarkRun, 'id'>> = {}): Omit<BenchmarkRun, 'id'> {
  const moves = makeMoves(n);
  return {
    gameId: 'g', engineId: 'stockfish-18', engineName: 'Stockfish 18', depth: 18, timestamp: Date.now(),
    moves, summary: buildSummary(moves), metadata: { white: 'a', black: 'b', event: 'e' },
    ...overrides,
  };
}

describe('saveRun', () => {
  it('stores only what the consistency report needs', () => {
    const saved = saveRun(runInput(10))!;
    expect(Object.keys(saved.moves[0]!).sort()).toEqual(['classification', 'evalAfter']);
    expect(localStorage.getItem('yelSatranc_benchmark_v1')).not.toContain('fenBefore');
  });

  it('keeps at most 30 runs, dropping the oldest', () => {
    for (let i = 0; i < 35; i++) saveRun(runInput(4, { timestamp: i, gameId: `g${i}` }));
    const runs = loadAllRuns();
    expect(runs).toHaveLength(30);
    expect(runs[0]!.gameId).toBe('g5');
    expect(runs.at(-1)!.gameId).toBe('g34');
  });

  it('shrinks runs saved by older versions when it rewrites the list', () => {
    const fat = { ...runInput(10), id: 'old' };           // full AnalyzedMove[] like v1
    localStorage.setItem('yelSatranc_benchmark_v1', JSON.stringify([fat]));
    saveRun(runInput(4));
    const old = loadAllRuns().find((r) => r.id === 'old')!;
    expect(Object.keys(old.moves[0]!).sort()).toEqual(['classification', 'evalAfter']);
  });

  it('drops older runs to make room and returns null only if the run itself cannot fit', () => {
    const one = JSON.stringify(saveRun(runInput(40))!).length; // measured with unlimited storage
    vi.unstubAllGlobals();
    installMemoryStorage(Math.floor(one * 2.5));              // room for ~2 runs
    for (let i = 0; i < 6; i++) expect(saveRun(runInput(40, { gameId: `g${i}` }))).not.toBeNull();
    expect(loadAllRuns().at(-1)!.gameId).toBe('g5');

    vi.unstubAllGlobals();
    installMemoryStorage(50);
    expect(saveRun(runInput(40))).toBeNull();
  });
});

describe('computeConsistency', () => {
  it('uses clamped evals so a mate ↔ centipawn flip is not a 10 000 cp spread', () => {
    const a = saveRun(runInput(4))!;
    const b = saveRun(runInput(4))!;
    const withEval = (run: BenchmarkRun, ev: BenchmarkRun['moves'][number]['evalAfter']): BenchmarkRun => ({
      ...run, moves: run.moves.map((m) => ({ ...m, evalAfter: ev })),
    });
    const report = computeConsistency([
      withEval(a, { type: 'mate', value: 3 }),
      withEval(b, { type: 'cp', value: 500 }),
    ])!;
    expect(report.avgEvalStdDevCp).toBe(250);             // (1000 − 500) / 2
  });

  it('needs at least two runs', () => {
    expect(computeConsistency([saveRun(runInput(4))!])).toBeNull();
  });
});
