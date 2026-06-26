import type { EvalResult } from '../lib/types';

type Score = { type: 'cp' | 'mate'; value: number };

export interface AnalysisResult {
  fen: string;
  eval: EvalResult;              // best-line score, white's POV
  bestMove: string;
  alternatives: string[];        // UCI moves for lines 2–3
  alternativeEvals: EvalResult[];// scores for lines 2–3, white's POV
  depth: number;
}

type AnalysisCallback = (result: AnalysisResult) => void;

function fenSide(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] as 'w' | 'b';
}

function parseScore(parts: string[]): Score | null {
  const idx = parts.indexOf('score');
  if (idx === -1) return null;
  const type = parts[idx + 1] as 'cp' | 'mate';
  const value = parseInt(parts[idx + 2], 10);
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
 */
export class StockfishService {
  private worker: Worker | null = null;
  private ready = false;
  private readyCallbacks: Array<() => void> = [];

  private currentFen = '';
  private bestByRank = new Map<number, { score: Score; pv: string[] }>();
  private lastDepth = 0;
  private analysisCallback: AnalysisCallback | null = null;
  private pendingAnalysis: { fen: string; depth: number; multiPv: number } | null = null;

  constructor(enginePath: string) {
    // Use the stockfish JS file directly as the worker (no Vite-managed wrapper).
    // This avoids Vite's restriction on importing JS files from /public as modules.
    this.worker = new Worker(enginePath);
    this.worker.onmessage = (e: MessageEvent) => {
      const line: string = typeof e.data === 'string' ? e.data : String(e.data ?? '');
      this.handleLine(line);
    };
    this.worker.onerror = (e) => console.error('[StockfishService] worker error', e);

    // UCI initialisation sequence
    this.send('uci');
    this.send('setoption name Hash value 64');
    this.send('setoption name Threads value 1');
    this.send('isready');
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private handleLine(line: string) {
    if (!line) return;

    // Engine ready — fire queued callbacks
    if (line === 'readyok') {
      this.ready = true;
      this.readyCallbacks.forEach((cb) => cb());
      this.readyCallbacks = [];
      if (this.pendingAnalysis) {
        this.doAnalyze(this.pendingAnalysis);
        this.pendingAnalysis = null;
      }
      return;
    }

    // Parse score/pv from info lines
    if (line.startsWith('info') && line.includes('score')) {
      const parts = line.split(' ');

      const depthIdx = parts.indexOf('depth');
      const depth = depthIdx !== -1 ? parseInt(parts[depthIdx + 1], 10) : 0;

      const mpvIdx = parts.indexOf('multipv');
      const multipv = mpvIdx !== -1 ? parseInt(parts[mpvIdx + 1], 10) : 1;

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
    if (line.startsWith('bestmove') && this.analysisCallback) {
      const line1 = this.bestByRank.get(1);
      // Terminal position (checkmate/stalemate): engine returns "bestmove (none)" with no info lines.
      if (!line1) {
        this.analysisCallback({
          fen: this.currentFen,
          eval: { type: 'mate', value: 0 },
          bestMove: '',
          alternatives: [],
          alternativeEvals: [],
          depth: 0,
        });
        return;
      }

      const move = line.split(' ')[1] ?? '';
      const side = fenSide(this.currentFen);
      const sign = side === 'w' ? 1 : -1;

      // Stockfish scores are from side-to-move's POV. Normalise to white's POV.
      const toWhitePov = (s: Score): EvalResult => ({
        type: s.type,
        value: s.value * sign,
      });

      const alternatives: string[] = [];
      const alternativeEvals: EvalResult[] = [];
      for (let i = 2; i <= 3; i++) {
        const altLine = this.bestByRank.get(i);
        if (altLine?.pv[0]) {
          alternatives.push(altLine.pv[0]);
          alternativeEvals.push(toWhitePov(altLine.score));
        }
      }

      this.analysisCallback({
        fen: this.currentFen,
        eval: toWhitePov(line1.score),
        bestMove: line1.pv[0] ?? move,
        alternatives,
        alternativeEvals,
        depth: this.lastDepth,
      });
    }
  }

  private doAnalyze(params: { fen: string; depth: number; multiPv: number }) {
    this.currentFen = params.fen;
    this.bestByRank.clear();
    this.lastDepth = 0;
    this.send('stop');
    this.send(`setoption name MultiPV value ${params.multiPv}`);
    this.send(`position fen ${params.fen}`);
    this.send(`go depth ${params.depth}`);
  }

  analyze(
    fen: string,
    depth: number,
    multiPv: number,
    callback: AnalysisCallback,
  ): void {
    this.analysisCallback = callback;
    const params = { fen, depth, multiPv };
    if (!this.ready) {
      this.pendingAnalysis = params;
    } else {
      this.doAnalyze(params);
    }
  }

  stop() { this.send('stop'); }

  terminate() {
    this.send('quit');
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  onReady(cb: () => void) {
    if (this.ready) cb();
    else this.readyCallbacks.push(cb);
  }
}
