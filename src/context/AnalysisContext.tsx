import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
} from 'react';
import { Chess } from 'chess.js';
import { StockfishService } from '../engine/StockfishService';
import { parsePgn, parseFen } from '../lib/pgn';
import {
  classifyMove,
  computeCpLoss,
  computeSecondBestCpLoss,
  computeAccuracy,
  computeAcpl,
  estimateElo,
} from '../lib/classification';
import { AVAILABLE_ENGINES, DEFAULT_ENGINE_ID } from '../lib/engines';
import { computeGameId, saveRun, type BenchmarkRun } from '../lib/benchmark';
import { saveAnalysisRecord, type AnalysisRecord } from '../lib/analysisHistory';
import type { AnalyzedMove, GameSummaryStats, PgnMetadata, EvalResult } from '../lib/types';

const DEFAULT_DEPTH = 18;
const DEFAULT_WORKER_COUNT = 1;
const DEFAULT_HASH_MB = 64;
const MULTI_PV = 3;

// ── Status ────────────────────────────────────────────────────────────────
export type AnalysisStatus = 'idle' | 'ready' | 'analyzing' | 'done' | 'error';

// ── State ─────────────────────────────────────────────────────────────────
interface AnalysisState {
  status: AnalysisStatus;
  error: string | null;
  metadata: PgnMetadata | null;
  moves: AnalyzedMove[];
  sanMoves: string[];
  fens: string[];
  currentIndex: number;
  analyzedCount: number;
  totalMoves: number;
  summary: GameSummaryStats | null;
  depth: number;
  engineId: string;
  workerCount: number;
  hashMb: number;
  gameId: string | null;
}

const initialState: AnalysisState = {
  status: 'idle',
  error: null,
  metadata: null,
  moves: [],
  sanMoves: [],
  fens: [],
  currentIndex: 0,
  analyzedCount: 0,
  totalMoves: 0,
  summary: null,
  depth: DEFAULT_DEPTH,
  engineId: DEFAULT_ENGINE_ID,
  workerCount: DEFAULT_WORKER_COUNT,
  hashMb: DEFAULT_HASH_MB,
  gameId: null,
};

// ── Actions ───────────────────────────────────────────────────────────────
type Action =
  | { type: 'GAME_LOADED'; metadata: PgnMetadata; fens: string[]; sanMoves: string[]; gameId: string }
  | { type: 'ANALYSIS_STARTED' }
  | { type: 'MOVE_ANALYZED'; move: AnalyzedMove }
  | { type: 'ANALYSIS_DONE'; summary: GameSummaryStats }
  | { type: 'ERROR'; message: string }
  | { type: 'NAVIGATE'; index: number }
  | { type: 'SET_DEPTH'; depth: number }
  | { type: 'SET_ENGINE'; engineId: string }
  | { type: 'SET_WORKER_COUNT'; count: number }
  | { type: 'SET_HASH_MB'; mb: number }
  | { type: 'RESTORE_ANALYSIS'; record: AnalysisRecord }
  | { type: 'RESET' };

function reducer(state: AnalysisState, action: Action): AnalysisState {
  switch (action.type) {
    case 'GAME_LOADED':
      return {
        ...state,
        status: 'ready',
        error: null,
        metadata: action.metadata,
        fens: action.fens,
        sanMoves: action.sanMoves,
        moves: [],
        currentIndex: 0,
        analyzedCount: 0,
        totalMoves: action.sanMoves.length,
        summary: null,
        gameId: action.gameId,
      };

    case 'ANALYSIS_STARTED':
      return { ...state, status: 'analyzing', moves: [], analyzedCount: 0 };

    case 'MOVE_ANALYZED':
      return {
        ...state,
        moves: [...state.moves, action.move],
        analyzedCount: state.analyzedCount + 1,
      };

    case 'ANALYSIS_DONE':
      return { ...state, status: 'done', summary: action.summary };

    case 'ERROR':
      return { ...state, status: 'error', error: action.message };

    case 'NAVIGATE':
      return { ...state, currentIndex: action.index };

    case 'SET_DEPTH':
      return { ...state, depth: action.depth };

    case 'SET_ENGINE':
      return { ...state, engineId: action.engineId };

    case 'SET_WORKER_COUNT':
      return { ...state, workerCount: action.count };

    case 'SET_HASH_MB':
      return { ...state, hashMb: action.mb };

    case 'RESTORE_ANALYSIS': {
      const r = action.record;
      return {
        ...state,
        status: 'done',
        error: null,
        metadata: r.metadata,
        fens: r.fens,
        sanMoves: r.sanMoves,
        moves: r.moves,
        analyzedCount: r.moves.length,
        totalMoves: r.sanMoves.length,
        summary: r.summary,
        currentIndex: 0,
        gameId: r.gameId,
      };
    }

    case 'RESET':
      return {
        ...initialState,
        depth: state.depth,
        engineId: state.engineId,
        workerCount: state.workerCount,
        hashMb: state.hashMb,
      };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────
interface AnalysisContextValue {
  state: AnalysisState;
  loadGame: (input: string) => void;
  startAnalysis: () => Promise<void>;
  navigate: (index: number) => void;
  reset: () => void;
  setDepth: (d: number) => void;
  setEngine: (id: string) => void;
  setWorkerCount: (n: number) => void;
  setHashMb: (mb: number) => void;
  saveCurrentAnalysis: () => BenchmarkRun | null;
  restoreAnalysis: (record: AnalysisRecord) => void;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const abortRef = useRef(false);
  const rawInputRef = useRef<string>('');
  // Tracks workers created during the current analysis so reset() can terminate them
  const activeWorkersRef = useRef<StockfishService[]>([]);

  // ── loadGame ─────────────────────────────────────────────────────────
  const loadGame = useCallback((input: string) => {
    abortRef.current = true;
    const trimmed = input.trim();
    rawInputRef.current = trimmed;
    let parsed: ReturnType<typeof parsePgn>;
    try {
      parsed = /^[rnbqkpRNBQKP1-8/]+ [wb]/.test(trimmed) && !trimmed.includes('\n')
        ? parseFen(trimmed)
        : parsePgn(trimmed);
    } catch (err) {
      dispatch({ type: 'ERROR', message: (err as Error).message });
      return;
    }
    dispatch({
      type: 'GAME_LOADED',
      metadata: parsed.metadata,
      fens: parsed.fens,
      sanMoves: parsed.moves,
      gameId: computeGameId(trimmed),
    });
  }, []);

  // ── startAnalysis: parallel worker pool ──────────────────────────────
  const startAnalysis = useCallback(async () => {
    const { fens, sanMoves, depth, engineId, workerCount, hashMb } = stateRef.current;
    if (!fens.length || !sanMoves.length) return;

    abortRef.current = false;
    dispatch({ type: 'ANALYSIS_STARTED' });

    const cfg = AVAILABLE_ENGINES.find((e) => e.id === engineId) ?? AVAILABLE_ENGINES[0];
    const workerPath = import.meta.env.BASE_URL + cfg.workerPath;

    // Each Stockfish WASM instance uses ~80MB base (NNUE weights) + hashMb.
    // Cap total hash so (base + hash) × workers stays within ~1.5GB.
    const TOTAL_HASH_BUDGET_MB = 512;
    const effectiveHashMb = Math.max(16, Math.min(hashMb, Math.floor(TOTAL_HASH_BUDGET_MB / workerCount)));

    // Create N workers
    const workers = Array.from({ length: workerCount }, () => new StockfishService(workerPath, effectiveHashMb));
    activeWorkersRef.current = workers;

    const evalCache: (EvalResult | null)[] = new Array(fens.length).fill(null);
    const bestMoves: (string | null)[] = new Array(fens.length).fill(null);
    const altMoves: string[][] = new Array(fens.length).fill([]);
    const altEvals: (EvalResult[])[] = new Array(fens.length).fill([]);

    // Pre-pass: replay moves to detect terminal positions and collect move metadata
    const moveData: Array<{ color: 'w' | 'b'; uci: string }> = [];
    {
      const chessPrepass = new Chess();
      for (let i = 0; i < sanMoves.length; i++) {
        const m = chessPrepass.move(sanMoves[i]);
        moveData.push({ color: m.color, uci: m.lan ?? '' });
        if (chessPrepass.isGameOver()) {
          evalCache[i + 1] = chessPrepass.isCheckmate()
            ? { type: 'mate', value: m.color === 'w' ? 1 : -1 }
            : { type: 'cp', value: 0 };
        }
      }
    }

    // Positions that need engine analysis (non-terminal)
    const pendingIndices = fens.map((_, i) => i).filter((i) => evalCache[i] === null);

    // Dispatch moves in order as adjacent pair results become available
    let nextDispatch = 0;
    const analyzedMoves: AnalyzedMove[] = [];

    const tryDispatch = () => {
      while (nextDispatch < sanMoves.length) {
        const i = nextDispatch;
        if (evalCache[i] === null || evalCache[i + 1] === null) break;

        const { color, uci } = moveData[i];
        const evalBefore = evalCache[i];
        const evalAfter  = evalCache[i + 1];

        let cpLoss = 0;
        if (evalBefore && evalAfter) cpLoss = computeCpLoss(evalBefore, evalAfter, color);

        let secondBestCpLoss = 9999;
        const alt2Eval = altEvals[i]?.[0] ?? null;
        if (evalBefore && alt2Eval) {
          secondBestCpLoss = computeSecondBestCpLoss(evalBefore, alt2Eval, color);
        }

        const classification = classifyMove(cpLoss, secondBestCpLoss, uci, bestMoves[i]);

        const analyzedMove: AnalyzedMove = {
          moveNumber: Math.floor(i / 2) + 1,
          color,
          san: sanMoves[i],
          uci,
          fenBefore: fens[i],
          fenAfter:  fens[i + 1],
          evalBefore,
          evalAfter,
          bestMove: bestMoves[i],
          bestEval: evalBefore,
          alternatives: altMoves[i] ?? [],
          alternativeEvals: altEvals[i] ?? [],
          classification,
          cpLoss,
          secondBestCpLoss,
        };

        analyzedMoves.push(analyzedMove);
        dispatch({ type: 'MOVE_ANALYZED', move: analyzedMove });
        nextDispatch++;
      }
    };

    // Run pending positions through the worker pool
    await new Promise<void>((resolveAll) => {
      const total = pendingIndices.length;
      if (total === 0) { resolveAll(); return; }

      let completed = 0;
      let queueIdx = 0;

      const runNext = (workerIdx: number) => {
        if (abortRef.current) return;
        if (queueIdx >= pendingIndices.length) return;

        const posIdx = pendingIndices[queueIdx++];
        workers[workerIdx].analyze(fens[posIdx], depth, MULTI_PV, (result) => {
          if (abortRef.current) return;

          evalCache[posIdx] = result.eval;
          bestMoves[posIdx] = result.bestMove;
          altMoves[posIdx]  = result.alternatives;
          altEvals[posIdx]  = result.alternativeEvals;

          tryDispatch();

          if (++completed >= total) {
            resolveAll();
          } else {
            runNext(workerIdx);
          }
        });
      };

      // Seed each worker with its first position
      for (let w = 0; w < workerCount && w < pendingIndices.length; w++) {
        runNext(w);
      }
    });

    workers.forEach((w) => w.terminate());
    activeWorkersRef.current = [];

    if (abortRef.current) return;

    const summary = buildSummary(analyzedMoves);
    dispatch({ type: 'ANALYSIS_DONE', summary });

    const s = stateRef.current;
    if (s.metadata) {
      saveAnalysisRecord({
        gameId: computeGameId(rawInputRef.current),
        pgn: rawInputRef.current,
        analyzedAt: Date.now(),
        depth,
        engineId,
        moves: analyzedMoves,
        summary,
        fens,
        sanMoves,
        metadata: s.metadata,
      });
    }
  }, []);

  const navigate  = useCallback((index: number) => dispatch({ type: 'NAVIGATE', index }), []);
  const setDepth  = useCallback((d: number)  => dispatch({ type: 'SET_DEPTH', depth: d }), []);
  const setEngine = useCallback((id: string) => dispatch({ type: 'SET_ENGINE', engineId: id }), []);
  const setWorkerCount = useCallback((n: number)  => dispatch({ type: 'SET_WORKER_COUNT', count: n }), []);
  const setHashMb      = useCallback((mb: number) => dispatch({ type: 'SET_HASH_MB', mb }), []);

  const reset = useCallback(() => {
    abortRef.current = true;
    activeWorkersRef.current.forEach((w) => w.terminate());
    activeWorkersRef.current = [];
    dispatch({ type: 'RESET' });
  }, []);

  const restoreAnalysis = useCallback((record: AnalysisRecord) => {
    abortRef.current = true;
    activeWorkersRef.current.forEach((w) => w.terminate());
    activeWorkersRef.current = [];
    rawInputRef.current = record.pgn;
    dispatch({ type: 'RESTORE_ANALYSIS', record });
  }, []);

  const saveCurrentAnalysis = useCallback((): BenchmarkRun | null => {
    const s = stateRef.current;
    if (s.status !== 'done' || !s.summary || !s.metadata || s.moves.length === 0) return null;
    const cfg = AVAILABLE_ENGINES.find((e) => e.id === s.engineId) ?? AVAILABLE_ENGINES[0];
    return saveRun({
      gameId: computeGameId(rawInputRef.current),
      engineId: s.engineId,
      engineName: cfg.name,
      depth: s.depth,
      timestamp: Date.now(),
      moves: s.moves,
      summary: s.summary,
      metadata: { white: s.metadata.white, black: s.metadata.black, event: s.metadata.event },
    });
  }, []);

  return (
    <AnalysisContext.Provider value={{
      state, loadGame, startAnalysis, navigate, reset,
      setDepth, setEngine, setWorkerCount, setHashMb, saveCurrentAnalysis, restoreAnalysis,
    }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be inside AnalysisProvider');
  return ctx;
}

// ── Build summary stats ───────────────────────────────────────────────────
function buildSummary(moves: AnalyzedMove[]): GameSummaryStats {
  const build = (side: 'w' | 'b') => {
    const ms = moves.filter((m) => m.color === side);
    const count = (cls: string) => ms.filter((m) => m.classification === cls).length;
    const acpl = computeAcpl(ms);
    return {
      kusursuz:   count('kusursuz'),
      muhtesem:   count('muhtesem'),
      best:       count('best'),
      excellent:  count('excellent'),
      good:       count('good'),
      inaccuracy: count('inaccuracy'),
      mistake:    count('mistake'),
      blunder:    count('blunder'),
      accuracy:   computeAccuracy(ms),
      acpl,
      estimatedElo: estimateElo(acpl),
    };
  };
  return { white: build('w'), black: build('b') };
}
