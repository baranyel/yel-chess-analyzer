import type { EvalResult } from '../lib/types';
import { EngineError, createAbortError, type AnalysisResult, type Engine } from './types';

type Score = { type: 'cp' | 'mate'; value: number };

interface Pending {
  resolve: (r: AnalysisResult) => void;
  reject: (e: Error) => void;
}

// The full build is ~110 MB, so a cold start on a slow connection takes a while.
const DEFAULT_READY_TIMEOUT_MS = 120_000;

function fenSide(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] as 'w' | 'b';
}

function parseScore(parts: string[]): Score | null {
  const idx = parts.indexOf('score');
  if (idx === -1) return null;
  const type = parts[idx + 1] as 'cp' | 'mate';
  const value = parseInt(parts[idx + 2] ?? '', 10);
  return isNaN(value) ? null : { type, value };
}

/**
 * Thin wrapper around the Stockfish WASM classic Worker.
 *
 * stockfish-18-single.js is designed to be used directly as a Web Worker:
 *   new Worker('/stockfish/stockfish-18-single.js')
 * It detects the worker context automatically and sets up a UCI message loop.
 * Communication is via plain UCI strings:
 *   postMessage("go depth 18")  →  onmessage = { data: "bestmove e2e4 ..." }
 *
 * Failures are never swallowed: a crashed / unloadable worker or a missed
 * `readyok` rejects `ready` and any in-flight `analyze()` with an EngineError,
 * and `terminate()` rejects them with an AbortError, so callers can never hang.
 */
export class StockfishService implements Engine {
  readonly ready: Promise<void>;

  private worker: Worker | null = null;
  private isReady = false;
  private failure: Error | null = null;
  private resolveReady!: () => void;
  private rejectReady!: (e: Error) => void;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  private pending: Pending | null = null;
  private startPending: (() => void) | null = null;
  private currentFen = '';
  private bestByRank = new Map<number, { score: Score; pv: string[] }>();
  private lastDepth = 0;

  constructor(enginePath: string, hashMb = 64, readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // Whoever awaits `ready` still sees the rejection; this only prevents an
    // "unhandled rejection" when nobody is awaiting it yet.
    this.ready.catch(() => {});

    this.readyTimer = setTimeout(
      () => this.fail(new EngineError('Motor zamanında hazır olmadı. Motor dosyaları yüklenemedi veya bağlantı çok yavaş.')),
      readyTimeoutMs,
    );

    try {
      // Use the stockfish JS file directly as the worker (no Vite-managed wrapper).
      // This avoids Vite's restriction on importing JS files from /public as modules.
      this.worker = new Worker(enginePath);
    } catch (err) {
      this.fail(new EngineError(`Motor başlatılamadı: ${(err as Error).message}`));
      return;
    }

    this.worker.onmessage = (e: MessageEvent) => {
      const line: string = typeof e.data === 'string' ? e.data : String(e.data ?? '');
      this.handleLine(line);
    };
    this.worker.onerror = (e: ErrorEvent) => {
      console.error('[StockfishService] worker error', e);
      const detail = e.message ? `: ${e.message}` : ' (motor dosyası bulunamadı olabilir)';
      this.fail(new EngineError(`Motor çöktü veya yüklenemedi${detail}`));
    };

    // UCI initialisation sequence
    this.send('uci');
    this.send(`setoption name Hash value ${hashMb}`);
    this.send('setoption name Threads value 1');
    this.send('isready');
  }

  analyze(fen: string, depth: number, multiPv: number): Promise<AnalysisResult> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new EngineError('Motor zaten başka bir pozisyonu analiz ediyor.'));

    return new Promise<AnalysisResult>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.currentFen = fen;
      this.bestByRank.clear();
      this.lastDepth = 0;

      const start = () => {
        this.send(`setoption name MultiPV value ${multiPv}`);
        this.send(`position fen ${fen}`);
        this.send(`go depth ${depth}`);
      };
      if (this.isReady) start();
      else this.startPending = start;
    });
  }

  terminate() {
    this.fail(createAbortError());
  }

  // ── internals ───────────────────────────────────────────────────────────

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  /** Marks the engine as broken and rejects everything that is waiting on it. */
  private fail(err: Error) {
    if (this.failure) return; // already failed or terminated — first cause wins
    this.failure = err;
    this.teardown(err);
  }

  private teardown(err: Error) {
    if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
    this.worker?.terminate();
    this.worker = null;
    this.startPending = null;
    this.rejectReady(err);
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      p.reject(err);
    }
  }

  private handleLine(line: string) {
    if (!line) return;

    if (line === 'readyok') {
      if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
      this.isReady = true;
      this.resolveReady();
      const start = this.startPending;
      this.startPending = null;
      start?.();
      return;
    }

    // Parse score/pv from info lines
    if (line.startsWith('info') && line.includes('score')) {
      // An aspiration-window bound is not a real score; the exact score for the
      // same depth always follows it.
      if (line.includes(' lowerbound') || line.includes(' upperbound')) return;

      const parts = line.split(' ');

      const depthIdx = parts.indexOf('depth');
      const depth = depthIdx !== -1 ? parseInt(parts[depthIdx + 1] ?? '', 10) : 0;

      const mpvIdx = parts.indexOf('multipv');
      const multipv = mpvIdx !== -1 ? parseInt(parts[mpvIdx + 1] ?? '', 10) : 1;

      const pvIdx = parts.indexOf('pv');
      const pv = pvIdx !== -1 ? parts.slice(pvIdx + 1) : [];

      const score = parseScore(parts);
      if (!score || pv.length === 0) return;

      const existing = this.bestByRank.get(multipv);
      if (!existing || depth >= this.lastDepth) {
        this.bestByRank.set(multipv, { score, pv });
        if (multipv === 1) this.lastDepth = Math.max(this.lastDepth, depth);
      }
      return;
    }

    // bestmove — analysis complete for this position
    if (line.startsWith('bestmove') && this.pending) {
      const p = this.pending;
      this.pending = null;

      const line1 = this.bestByRank.get(1);
      if (!line1) {
        // Only happens for a position with no legal moves; the pipeline resolves
        // those itself, so this means something is wrong.
        p.reject(new EngineError('Motor bu pozisyon için sonuç döndürmedi.'));
        return;
      }

      const move = line.split(' ')[1] ?? '';
      const sign = fenSide(this.currentFen) === 'w' ? 1 : -1;

      // Stockfish scores are from side-to-move's POV. Normalise to white's POV.
      const toWhitePov = (s: Score): EvalResult => ({ type: s.type, value: s.value * sign });

      const alternatives: string[] = [];
      const alternativeEvals: EvalResult[] = [];
      for (const [rank, altLine] of [...this.bestByRank.entries()].sort((a, b) => a[0] - b[0])) {
        if (rank === 1 || !altLine.pv[0]) continue;
        alternatives.push(altLine.pv[0]);
        alternativeEvals.push(toWhitePov(altLine.score));
      }

      p.resolve({
        fen: this.currentFen,
        eval: toWhitePov(line1.score),
        bestMove: line1.pv[0] ?? move,
        alternatives,
        alternativeEvals,
        depth: this.lastDepth,
      });
    }
  }
}
