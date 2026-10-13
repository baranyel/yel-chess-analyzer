import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { parseFen, parsePgn } from '../lib/pgn';
import type { AnalyzedMove, EvalResult } from '../lib/types';
import { EnginePool, analyzeGame } from './analyzeGame';
import {
  EngineError,
  createAbortError,
  type AnalysisResult,
  type Engine,
  type EngineStage,
} from './types';

// ── Test doubles ──────────────────────────────────────────────────────────

type Responder = (fen: string, multiPv: number) => AnalysisResult | Promise<AnalysisResult>;

function firstLegalUci(fen: string): string {
  const m = new Chess(fen).moves({ verbose: true })[0];
  return m ? m.from + m.to + (m.promotion ?? '') : '';
}

function result(fen: string, ev: EvalResult, multiPv: number): AnalysisResult {
  const alt: EvalResult = { type: 'cp', value: ev.type === 'cp' ? ev.value - 40 : 0 };
  return {
    fen,
    eval: ev,
    bestMove: firstLegalUci(fen),
    alternatives: multiPv > 1 ? ['a2a3'] : [],
    alternativeEvals: multiPv > 1 ? [alt] : [],
    depth: 10,
  };
}

const flat: Responder = (fen, multiPv) => result(fen, { type: 'cp', value: 0 }, multiPv);

class FakeEngine implements Engine {
  ready: Promise<void> = Promise.resolve();
  terminated = false;
  calls: Array<{ fen: string; multiPv: number }> = [];
  private respond: Responder;
  private rejectPending: ((e: Error) => void) | null = null;

  constructor(respond: Responder = flat) {
    this.respond = respond;
  }

  analyze(fen: string, _depth: number, multiPv: number): Promise<AnalysisResult> {
    this.calls.push({ fen, multiPv });
    return new Promise<AnalysisResult>((resolve, reject) => {
      if (this.terminated) { reject(createAbortError()); return; }
      this.rejectPending = reject;
      Promise.resolve(this.respond(fen, multiPv)).then(
        (r) => { if (!this.terminated) { this.rejectPending = null; resolve(r); } },
        (e) => { this.rejectPending = null; reject(e); },
      );
    });
  }

  terminate() {
    this.terminated = true;
    this.rejectPending?.(createAbortError());
    this.rejectPending = null;
  }
}

function makePool(engines: FakeEngine[], signal?: AbortSignal): EnginePool {
  let i = 0;
  return new EnginePool(() => engines[i++]!, engines.length, signal);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Tests ─────────────────────────────────────────────────────────────────

describe('analyzeGame', () => {
  it('analyses every position exactly once and emits moves in game order', async () => {
    const parsed = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
    // Later positions answer first, so completion order is the reverse of game order.
    const slow: Responder = async (fen, multiPv) => {
      await wait((parsed.fens.length - parsed.fens.indexOf(fen)) * 6);
      return flat(fen, multiPv);
    };
    const engines = [new FakeEngine(slow), new FakeEngine(slow), new FakeEngine(slow)];
    const pool = makePool(engines);

    const order: number[] = [];
    const res = await analyzeGame({
      fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool,
      onMove: (_m, i) => order.push(i),
    });
    pool.terminate();

    const analysed = engines.flatMap((e) => e.calls.map((c) => c.fen));
    expect(analysed.sort()).toEqual([...parsed.fens].sort());
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
    expect(res.moves.map((m) => m.san)).toEqual(parsed.moves);
  });

  it('asks for two lines everywhere except the final position', async () => {
    const parsed = parsePgn('1. e4 e5 2. Nf3');
    const engine = new FakeEngine();
    const pool = makePool([engine]);
    await analyzeGame({ fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool });
    pool.terminate();

    const byFen = new Map(engine.calls.map((c) => [c.fen, c.multiPv]));
    expect(byFen.get(parsed.fens[parsed.fens.length - 1]!)).toBe(1);
    expect(byFen.get(parsed.fens[0]!)).toBe(2);
    expect(byFen.get(parsed.fens[1]!)).toBe(2);
  });

  it('analyses a single FEN position with three lines and no moves', async () => {
    const parsed = parseFen('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    const engine = new FakeEngine();
    const pool = makePool([engine]);
    const res = await analyzeGame({ fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool });
    pool.terminate();

    expect(res.moves).toHaveLength(0);
    expect(res.lastPosition.bestMove).not.toBe('');
    expect(engine.calls).toEqual([{ fen: parsed.fens[0], multiPv: 3 }]);
  });

  it('does not send a checkmate position to the engine and scores it as mate', async () => {
    const parsed = parsePgn('1. f3 e5 2. g4 Qh4#');
    const engine = new FakeEngine();
    const pool = makePool([engine]);
    const res = await analyzeGame({ fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool });
    pool.terminate();

    expect(engine.calls).toHaveLength(parsed.fens.length - 1);
    expect(engine.calls.map((c) => c.fen)).not.toContain(parsed.fens[parsed.fens.length - 1]);
    expect(res.lastPosition.eval).toEqual({ type: 'mate', value: -1 }); // white is mated
    expect(res.moves).toHaveLength(4);
  });

  it('still asks the engine about a repeated position when the game plays on', async () => {
    // The start position occurs a third time after move 4, but the game continues.
    const parsed = parsePgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. e4 e5');
    const engine = new FakeEngine();
    const pool = makePool([engine]);
    await analyzeGame({ fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool });
    pool.terminate();

    expect(engine.calls).toHaveLength(parsed.fens.length);
    expect(engine.calls.map((c) => c.fen)).toContain(parsed.fens[8]);
  });

  it('replays from a custom start position', async () => {
    const start = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const c = new Chess(start);
    const fens = [c.fen()];
    const sans: string[] = [];
    for (const san of ['e4', 'Kd7']) { c.move(san); sans.push(san); fens.push(c.fen()); }

    const engine = new FakeEngine();
    const pool = makePool([engine]);
    const res = await analyzeGame({ fens, sanMoves: sans, depth: 10, pool });
    pool.terminate();

    expect(res.moves.map((m) => m.uci)).toEqual(['e2e4', 'e8d7']);
    expect(res.moves[0]!.moveNumber).toBe(1);
  });

  it('classifies moves from the engine evaluations', async () => {
    const parsed = parsePgn('1. e4 e5');
    // White's first move drops the evaluation from 0 to -500 (white POV).
    const scripted: Responder = (fen, multiPv) =>
      result(fen, { type: 'cp', value: fen === parsed.fens[0] ? 0 : -500 }, multiPv);
    const pool = makePool([new FakeEngine(scripted)]);
    const res = await analyzeGame({ fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool });
    pool.terminate();

    expect(res.moves[0]!.classification).toBe('blunder');
    expect(res.moves[0]!.cpLoss).toBe(500);
  });

  it('reports the engine loading stage before analysing', async () => {
    const parsed = parsePgn('1. e4 e5');
    const stages: EngineStage[] = [];
    const pool = makePool([new FakeEngine()]);
    await analyzeGame({
      fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool,
      onStage: (s) => stages.push(s),
    });
    pool.terminate();
    expect(stages).toEqual(['loading-engine', 'analyzing']);
  });

  it('rejects with an AbortError and terminates every engine when aborted mid-run', async () => {
    const parsed = parsePgn('1. e4 e5 2. Nf3 Nc6');
    const never: Responder = () => new Promise<AnalysisResult>(() => {});
    const engines = [new FakeEngine(never), new FakeEngine(never)];
    const controller = new AbortController();
    const pool = makePool(engines, controller.signal);

    const run = analyzeGame({ fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool, signal: controller.signal });
    await wait(10);
    expect(engines.some((e) => e.calls.length > 0)).toBe(true);

    controller.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(engines.every((e) => e.terminated)).toBe(true);
  });

  it('rejects instead of hanging when an engine fails', async () => {
    const parsed = parsePgn('1. e4 e5 2. Nf3 Nc6');
    const boom: Responder = () => Promise.reject(new EngineError('motor çöktü'));
    const pool = makePool([new FakeEngine(boom), new FakeEngine(boom)]);

    await expect(
      analyzeGame({ fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool }),
    ).rejects.toBeInstanceOf(EngineError);
    pool.terminate();
  });

  it('rejects with the load error when an engine never becomes ready', async () => {
    const parsed = parsePgn('1. e4 e5');
    const broken = new FakeEngine();
    broken.ready = Promise.reject(new EngineError('motor yüklenemedi'));
    broken.ready.catch(() => {});
    const stages: EngineStage[] = [];
    const pool = makePool([broken]);

    await expect(
      analyzeGame({
        fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool,
        onStage: (s) => stages.push(s),
      }),
    ).rejects.toThrow('motor yüklenemedi');
    pool.terminate();
    expect(stages).toEqual(['loading-engine']);
  });

  it('never emits moves after the run was aborted', async () => {
    const parsed = parsePgn('1. e4 e5 2. Nf3 Nc6');
    const controller = new AbortController();
    const emitted: AnalyzedMove[] = [];
    const slow: Responder = async (fen, multiPv) => { await wait(15); return flat(fen, multiPv); };
    const pool = makePool([new FakeEngine(slow)], controller.signal);

    const run = analyzeGame({
      fens: parsed.fens, sanMoves: parsed.moves, depth: 10, pool, signal: controller.signal,
      onMove: (m) => { emitted.push(m); controller.abort(); },
    });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    // At most the move that triggered the abort; nothing after it.
    expect(emitted.length).toBeLessThanOrEqual(1);
  });
});
