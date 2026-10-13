import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockfishService } from './StockfishService';
import { EngineError } from './types';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  sent: string[] = [];
  terminated = false;

  constructor(_url: string) {
    FakeWorker.instances.push(this);
  }
  postMessage(cmd: string) { this.sent.push(cmd); }
  terminate() { this.terminated = true; }
  emit(line: string) { this.onmessage?.({ data: line }); }
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function setup(readyTimeoutMs?: number) {
  const svc = new StockfishService('/stockfish/x.js', 64, readyTimeoutMs);
  const worker = FakeWorker.instances.at(-1)!;
  return { svc, worker };
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('StockfishService', () => {
  it('runs the UCI init sequence and resolves ready on readyok', async () => {
    const { svc, worker } = setup();
    expect(worker.sent).toEqual([
      'uci',
      'setoption name Hash value 64',
      'setoption name Threads value 1',
      'isready',
    ]);
    worker.emit('readyok');
    await expect(svc.ready).resolves.toBeUndefined();
  });

  it('queues analyze() until the engine is ready, then starts the search', async () => {
    const { svc, worker } = setup();
    const p = svc.analyze(START, 12, 2);
    expect(worker.sent).not.toContain('go depth 12');

    worker.emit('readyok');
    expect(worker.sent.slice(-3)).toEqual([
      'setoption name MultiPV value 2',
      `position fen ${START}`,
      'go depth 12',
    ]);
    worker.emit('info depth 12 multipv 1 score cp 20 pv e2e4 e7e5');
    worker.emit('bestmove e2e4 ponder e7e5');
    await expect(p).resolves.toMatchObject({ bestMove: 'e2e4', depth: 12, eval: { type: 'cp', value: 20 } });
  });

  it('normalises scores to White\'s point of view when Black is to move', async () => {
    const { svc, worker } = setup();
    worker.emit('readyok');
    const p = svc.analyze(AFTER_E4, 10, 2);
    worker.emit('info depth 10 multipv 1 score cp 35 pv e7e5 g1f3');   // good for Black
    worker.emit('info depth 10 multipv 2 score cp 10 pv c7c5 g1f3');
    worker.emit('bestmove e7e5');
    const r = await p;
    expect(r.eval).toEqual({ type: 'cp', value: -35 });
    expect(r.alternatives).toEqual(['c7c5']);
    expect(r.alternativeEvals).toEqual([{ type: 'cp', value: -10 }]);
  });

  it('ignores aspiration-window bound lines and keeps the exact score', async () => {
    const { svc, worker } = setup();
    worker.emit('readyok');
    const p = svc.analyze(START, 14, 1);
    worker.emit('info depth 14 multipv 1 score cp 25 pv e2e4');
    worker.emit('info depth 14 multipv 1 score cp 900 lowerbound pv d2d4');
    worker.emit('info depth 14 multipv 1 score cp -900 upperbound pv a2a3');
    worker.emit('bestmove e2e4');
    await expect(p).resolves.toMatchObject({ bestMove: 'e2e4', eval: { type: 'cp', value: 25 } });
  });

  it('parses mate scores', async () => {
    const { svc, worker } = setup();
    worker.emit('readyok');
    const p = svc.analyze(START, 10, 1);
    worker.emit('info depth 10 multipv 1 score mate 3 pv d1h5');
    worker.emit('bestmove d1h5');
    await expect(p).resolves.toMatchObject({ eval: { type: 'mate', value: 3 } });
  });

  it('rejects when bestmove arrives without any scored line', async () => {
    const { svc, worker } = setup();
    worker.emit('readyok');
    const p = svc.analyze(START, 10, 1);
    worker.emit('bestmove (none)');
    await expect(p).rejects.toBeInstanceOf(EngineError);
  });

  it('refuses a second analyze() while one is running', async () => {
    const { svc, worker } = setup();
    worker.emit('readyok');
    const first = svc.analyze(START, 10, 1);
    await expect(svc.analyze(START, 10, 1)).rejects.toBeInstanceOf(EngineError);
    worker.emit('info depth 10 multipv 1 score cp 0 pv e2e4');
    worker.emit('bestmove e2e4');
    await expect(first).resolves.toBeDefined();
  });

  it('a worker crash rejects ready + the pending search with an EngineError and kills the worker', async () => {
    const { svc, worker } = setup();
    const p = svc.analyze(START, 10, 1);
    worker.onerror?.({ message: '404' });

    await expect(svc.ready).rejects.toBeInstanceOf(EngineError);
    await expect(p).rejects.toBeInstanceOf(EngineError);
    expect(worker.terminated).toBe(true);
    // No fake 0.00 result: later calls fail fast instead of hanging.
    await expect(svc.analyze(START, 10, 1)).rejects.toBeInstanceOf(EngineError);
  });

  it('terminate() rejects a pending search with an AbortError', async () => {
    const { svc, worker } = setup();
    worker.emit('readyok');
    const p = svc.analyze(START, 10, 1);
    svc.terminate();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
    await expect(svc.analyze(START, 10, 1)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('times out when the engine never answers isready', async () => {
    vi.useFakeTimers();
    const { svc } = setup(1000);
    const assertion = expect(svc.ready).rejects.toBeInstanceOf(EngineError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('reports a Worker constructor failure as an EngineError', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('blocked'); } });
    const svc = new StockfishService('/x.js');
    await expect(svc.ready).rejects.toBeInstanceOf(EngineError);
    await expect(svc.analyze(START, 10, 1)).rejects.toBeInstanceOf(EngineError);
  });
});
