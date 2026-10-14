// Minimal UCI driver for the npm stockfish build under Node (one process = one thread).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const BIN = {
  'stockfish-18': '../../node_modules/stockfish/bin/stockfish-18-single.js',
  'stockfish-18-lite': '../../node_modules/stockfish/bin/stockfish-18-lite-single.js',
};

export class Engine {
  constructor(id = 'stockfish-18', hashMb = 64) {
    const path = fileURLToPath(new URL(BIN[id], import.meta.url));
    this.proc = spawn(process.execPath, [path], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.waiters = [];
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      for (const w of [...this.waiters]) w(line);
    });
    this.send('uci');
    this.send(`setoption name Hash value ${hashMb}`);
    this.ready = this.until((l) => l === 'readyok', () => this.send('isready'));
  }

  send(cmd) { this.proc.stdin.write(cmd + '\n'); }

  /** Resolves with the first line matching `pred`; `onLine` sees every line meanwhile. */
  until(pred, start, onLine) {
    return new Promise((resolve) => {
      const w = (line) => {
        onLine?.(line);
        if (pred(line)) { this.waiters = this.waiters.filter((x) => x !== w); resolve(line); }
      };
      this.waiters.push(w);
      start?.();
    });
  }

  /** Eval of `fen` from WHITE's point of view: { cp } or { mate }. */
  async evaluate(fen, depth) {
    await this.ready;
    let score = null;
    const whiteToMove = fen.split(' ')[1] === 'w';
    await this.until(
      (l) => l.startsWith('bestmove'),
      () => { this.send(`position fen ${fen}`); this.send(`go depth ${depth}`); },
      (l) => {
        const m = / score (cp|mate) (-?\d+)/.exec(l);
        if (m && !/ (lowerbound|upperbound)/.test(l)) score = { type: m[1], v: Number(m[2]) };
      },
    );
    if (!score) return { cp: 0 };
    const v = whiteToMove ? score.v : -score.v;
    return score.type === 'mate' ? { mate: v } : { cp: v };
  }

  quit() { this.send('quit'); this.proc.kill(); }
}
