import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { installMemoryStorage } from '../test/memoryStorage';
import { runAccountAnalysis, type AccountProgress } from './accountAnalysis';
import { loadAnalysisRecord, computeGameId } from './analysisHistory';
import type { GameSummary } from './accounts';

// A fake Stockfish that really speaks enough UCI for StockfishService:
// isready → readyok, go → one info line per requested PV + bestmove.
class UciFakeWorker {
  static instances: UciFakeWorker[] = [];
  static hang = false; // when true, `go` never answers (to test cancelling)

  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  terminated = false;
  private fen = '';
  private multiPv = 1;

  constructor(_url: string) {
    UciFakeWorker.instances.push(this);
  }

  terminate() { this.terminated = true; }

  postMessage(cmd: string) {
    queueMicrotask(() => {
      if (this.terminated) return;
      if (cmd === 'isready') this.emit('readyok');
      else if (cmd.startsWith('setoption name MultiPV value ')) this.multiPv = Number(cmd.split(' ').pop());
      else if (cmd.startsWith('position fen ')) this.fen = cmd.slice('position fen '.length);
      else if (cmd.startsWith('go ') && !UciFakeWorker.hang) this.search();
    });
  }

  private emit(line: string) { this.onmessage?.({ data: line }); }

  private search() {
    const moves = new Chess(this.fen).moves({ verbose: true });
    const uci = (i: number) => {
      const m = moves[Math.min(i, moves.length - 1)]!;
      return m.from + m.to + (m.promotion ?? '');
    };
    for (let pv = 1; pv <= this.multiPv; pv++) {
      this.emit(`info depth 8 multipv ${pv} score cp ${20 - pv * 10} pv ${uci(pv - 1)}`);
    }
    this.emit(`bestmove ${uci(0)}`);
  }
}

const pgn = (white: string, black: string, moves: string) =>
  `[White "${white}"]\n[Black "${black}"]\n\n${moves} *`;

function game(id: string, white: string, black: string, moves = '1. e4 e5 2. Nf3 Nc6'): GameSummary {
  return { id, platform: 'lichess', white, black, result: '1-0', date: 'x', pgn: pgn(white, black, moves) };
}

async function run(
  games: GameSummary[],
  opts: { depth?: number; signal?: AbortSignal; onProgress?: (p: AccountProgress) => void } = {},
) {
  return runAccountAnalysis(
    games, 'ann', '/stockfish/fake.js', 'stockfish-18', opts.depth ?? 8, 2, 64,
    opts.onProgress ?? (() => {}), opts.signal ?? new AbortController().signal,
  );
}

beforeEach(() => {
  installMemoryStorage();
  UciFakeWorker.instances = [];
  UciFakeWorker.hang = false;
  vi.stubGlobal('Worker', UciFakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runAccountAnalysis', () => {
  it('analyses the user\'s side of each game, skips the rest and stores the analyses', async () => {
    const games = [
      game('1', 'ann', 'bob'),
      game('2', 'carl', 'ann'),
      game('3', 'zed', 'bob'),                                  // user not a player
      { ...game('4', 'ann', 'bob'), pgn: 'this is not a pgn' }, // unparsable
    ];
    const res = await run(games);

    expect(res.gamesAnalyzed).toBe(2);
    expect(res.skipped).toBe(2);
    // 4 plies per game: ann has 2 of them in each game
    expect(res.stats.best + res.stats.excellent + res.stats.good + res.stats.inaccuracy +
      res.stats.mistake + res.stats.blunder + res.stats.kusursuz + res.stats.muhtesem).toBe(4);
    expect(loadAnalysisRecord(computeGameId(games[0]!.pgn.trim()))).not.toBeNull();
  });

  it('reuses one engine pool for all games and terminates it at the end', async () => {
    await run([game('1', 'ann', 'bob'), game('2', 'ann', 'carl'), game('3', 'dan', 'ann')]);
    expect(UciFakeWorker.instances).toHaveLength(2);           // workerCount = 2, not 2 per game
    expect(UciFakeWorker.instances.every((w) => w.terminated)).toBe(true);
  });

  it('reuses a stored analysis only if it is at least as deep', async () => {
    const games = [game('1', 'ann', 'bob')];
    await run(games, { depth: 8 });
    const afterFirst = UciFakeWorker.instances.length;

    await run(games, { depth: 8 });                            // same depth → cached
    expect(UciFakeWorker.instances.length).toBe(afterFirst);

    await run(games, { depth: 6 });                            // shallower request → cached
    expect(UciFakeWorker.instances.length).toBe(afterFirst);

    await run(games, { depth: 12 });                           // deeper request → re-analysed
    expect(UciFakeWorker.instances.length).toBeGreaterThan(afterFirst);
    expect(loadAnalysisRecord(computeGameId(games[0]!.pgn.trim()))!.depth).toBe(12);
  });

  it('reports progress and an ETA once a game has been analysed', async () => {
    const seen: AccountProgress[] = [];
    await run([game('1', 'ann', 'bob'), game('2', 'ann', 'carl')], { onProgress: (p) => seen.push(p) });

    expect(seen.at(-1)).toMatchObject({ done: 2, total: 2, fraction: 1 });
    expect(seen.some((p) => p.etaMs === null)).toBe(true);     // before the first game finished
    expect(seen.some((p) => p.etaMs !== null)).toBe(true);     // afterwards
    expect(seen.every((p) => p.fraction >= 0 && p.fraction <= 1)).toBe(true);
  });

  it('rejects with an AbortError and kills every worker when cancelled mid-game', async () => {
    UciFakeWorker.hang = true;
    const controller = new AbortController();
    const p = run([game('1', 'ann', 'bob')], { signal: controller.signal });

    await vi.waitFor(() => expect(UciFakeWorker.instances.length).toBeGreaterThan(0));
    controller.abort();

    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(UciFakeWorker.instances.every((w) => w.terminated)).toBe(true);
  });

  it('surfaces an engine failure instead of hanging', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    class CrashingWorker extends UciFakeWorker {
      override postMessage(cmd: string) {
        if (cmd === 'isready') queueMicrotask(() => this.onerror?.({ message: 'boom' }));
      }
    }
    vi.stubGlobal('Worker', CrashingWorker);

    await expect(run([game('1', 'ann', 'bob')])).rejects.toMatchObject({ name: 'EngineError' });
  });
});

describe('runAccountAnalysis — performance', () => {
  it('estimates from results and leaves bullet / daily games out of the estimate', async () => {
    const games = [
      { ...game('a', 'ann', 'bob'), whiteElo: 1500, blackElo: 1600, timeControl: 'Blitz' },
      { ...game('b', 'bob', 'ann'), whiteElo: 1550, blackElo: 1500, timeControl: 'Bullet' },
      { ...game('c', 'ann', 'cy'), whiteElo: 1500, blackElo: 1400, timeControl: 'Günlük' },
    ];
    const r = await run(games);
    expect(r.gamesAnalyzed).toBe(3);
    expect(r.outOfScope).toBe(2);
    expect(r.performance.games).toBe(1);
    expect(r.performance.platform).toBe('lichess');
    expect(r.performance.playerRating).toBe(1500);
    // The PGN result is "*" (unfinished), so there is no score and no results-based rating.
    expect(r.performance.results).toBeNull();
  });
});
