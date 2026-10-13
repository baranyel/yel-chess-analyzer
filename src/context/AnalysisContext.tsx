import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { StockfishService } from '../engine/StockfishService';
import { EnginePool, analyzeGame } from '../engine/analyzeGame';
import { isAbortError, type EngineStage } from '../engine/types';
import { parsePgn, parseFen } from '../lib/pgn';
import { AVAILABLE_ENGINES, DEFAULT_ENGINE_ID } from '../lib/engines';
import { defaultWorkerCount, effectiveHashMb } from '../lib/engineConfig';
import { buildSummary } from '../lib/summary';
import { computeGameId, saveRun, type BenchmarkRun } from '../lib/benchmark';
import { saveAnalysisRecord, type AnalysisRecord } from '../lib/analysisHistory';
import type { AnalyzedMove, GameSummaryStats, PgnMetadata, PositionAnalysis } from '../lib/types';

const DEFAULT_DEPTH = 18;
const DEFAULT_HASH_MB = 64;

// ── Status ────────────────────────────────────────────────────────────────
export type AnalysisStatus = 'idle' | 'ready' | 'analyzing' | 'done';

// ── State ─────────────────────────────────────────────────────────────────
interface AnalysisState {
  status: AnalysisStatus;
  /** Set when the last analysis run failed (engine crash / load failure). The loaded game is kept. */
  analysisError: string | null;
  /** Set when a finished analysis could not be stored (browser storage full). */
  storageWarning: string | null;
  /** While analyzing: are the engines still loading, or already searching? */
  engineStage: EngineStage | null;
  metadata: PgnMetadata | null;
  moves: AnalyzedMove[];
  sanMoves: string[];
  fens: string[];
  currentIndex: number;
  analyzedCount: number;
  totalMoves: number;
  summary: GameSummaryStats | null;
  /** Engine verdict for the last position (the only position in FEN mode). */
  positionAnalysis: PositionAnalysis | null;
  depth: number;
  engineId: string;
  workerCount: number;
  hashMb: number;
  gameId: string | null;
}

const initialState: AnalysisState = {
  status: 'idle',
  analysisError: null,
  storageWarning: null,
  engineStage: null,
  metadata: null,
  moves: [],
  sanMoves: [],
  fens: [],
  currentIndex: 0,
  analyzedCount: 0,
  totalMoves: 0,
  summary: null,
  positionAnalysis: null,
  depth: DEFAULT_DEPTH,
  engineId: DEFAULT_ENGINE_ID,
  workerCount: defaultWorkerCount(),
  hashMb: DEFAULT_HASH_MB,
  gameId: null,
};

// ── Actions ───────────────────────────────────────────────────────────────
type Action =
  | { type: 'GAME_LOADED'; metadata: PgnMetadata; fens: string[]; sanMoves: string[]; gameId: string }
  | { type: 'ANALYSIS_STARTED' }
  | { type: 'ENGINE_STAGE'; stage: EngineStage }
  | { type: 'MOVE_ANALYZED'; move: AnalyzedMove }
  | { type: 'ANALYSIS_DONE'; summary: GameSummaryStats | null; positionAnalysis: PositionAnalysis }
  | { type: 'ANALYSIS_FAILED'; message: string }
  | { type: 'ANALYSIS_STOPPED' }
  | { type: 'STORAGE_WARNING'; message: string }
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
        analysisError: null,
        storageWarning: null,
        engineStage: null,
        metadata: action.metadata,
        fens: action.fens,
        sanMoves: action.sanMoves,
        moves: [],
        currentIndex: 0,
        analyzedCount: 0,
        totalMoves: action.sanMoves.length,
        summary: null,
        positionAnalysis: null,
        gameId: action.gameId,
      };

    case 'ANALYSIS_STARTED':
      return {
        ...state,
        status: 'analyzing',
        analysisError: null,
        storageWarning: null,
        engineStage: 'loading-engine',
        moves: [],
        analyzedCount: 0,
        summary: null,
        positionAnalysis: null,
      };

    case 'ENGINE_STAGE':
      return { ...state, engineStage: action.stage };

    case 'MOVE_ANALYZED':
      return {
        ...state,
        moves: [...state.moves, action.move],
        analyzedCount: state.analyzedCount + 1,
      };

    case 'ANALYSIS_DONE':
      return {
        ...state,
        status: 'done',
        engineStage: null,
        summary: action.summary,
        positionAnalysis: action.positionAnalysis,
      };

    case 'ANALYSIS_FAILED':
      // Keep the loaded game and any moves analysed so far; just surface the error.
      return { ...state, status: 'ready', engineStage: null, analysisError: action.message };

    case 'ANALYSIS_STOPPED':
      return { ...state, status: 'ready', engineStage: null };

    case 'STORAGE_WARNING':
      return { ...state, storageWarning: action.message };

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
        analysisError: null,
        storageWarning: null,
        engineStage: null,
        metadata: r.metadata,
        fens: r.fens,
        sanMoves: r.sanMoves,
        moves: r.moves,
        analyzedCount: r.moves.length,
        totalMoves: r.sanMoves.length,
        summary: r.summary,
        positionAnalysis: null,
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
  /** Returns an error message when the input could not be parsed (the current game is left untouched), else null. */
  loadGame: (input: string) => string | null;
  /** Loads the input and starts analysing it right away. Same return value as loadGame. */
  loadAndAnalyze: (input: string) => string | null;
  startAnalysis: () => Promise<void>;
  stopAnalysis: () => void;
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

interface GameToAnalyze {
  fens: string[];
  sanMoves: string[];
  metadata: PgnMetadata | null;
}

function looksLikeFen(text: string): boolean {
  return /^[rnbqkpRNBQKP1-8/]+ [wb]/.test(text) && !text.includes('\n');
}

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const rawInputRef = useRef<string>('');
  // One controller per analysis run. Every dispatch of a run is guarded by its own
  // signal, so a cancelled/superseded run can never write into the current state.
  const runRef = useRef<AbortController | null>(null);

  const cancelRun = useCallback(() => {
    runRef.current?.abort();
    runRef.current = null;
  }, []);

  // Provider unmount: don't leave engines running.
  useEffect(() => cancelRun, [cancelRun]);

  // ── loadGame ─────────────────────────────────────────────────────────
  // Parses and installs a game. Returns the parse error, or the parsed game on success.
  const installGame = useCallback((input: string): { error: string } | { game: GameToAnalyze } => {
    const trimmed = input.trim();
    let parsed: ReturnType<typeof parsePgn>;
    try {
      parsed = looksLikeFen(trimmed) ? parseFen(trimmed) : parsePgn(trimmed);
    } catch (err) {
      return { error: (err as Error).message };
    }
    // Only now is it safe to drop the running analysis (bad input must not kill it).
    cancelRun();
    rawInputRef.current = trimmed;
    dispatch({
      type: 'GAME_LOADED',
      metadata: parsed.metadata,
      fens: parsed.fens,
      sanMoves: parsed.moves,
      gameId: computeGameId(trimmed),
    });
    return { game: { fens: parsed.fens, sanMoves: parsed.moves, metadata: parsed.metadata } };
  }, [cancelRun]);

  const loadGame = useCallback((input: string): string | null => {
    const r = installGame(input);
    return 'error' in r ? r.error : null;
  }, [installGame]);

  // ── analysis ─────────────────────────────────────────────────────────
  // Takes the game explicitly: right after loadGame the reducer state has not been
  // committed yet, so "load and analyse" cannot read it from stateRef.
  const runAnalysis = useCallback(async (game: GameToAnalyze) => {
    const { depth, engineId, workerCount, hashMb } = stateRef.current;
    const { fens, sanMoves, metadata } = game;
    if (!fens.length) return;

    cancelRun();
    const controller = new AbortController();
    runRef.current = controller;
    const { signal } = controller;
    dispatch({ type: 'ANALYSIS_STARTED' });

    const cfg = AVAILABLE_ENGINES.find((e) => e.id === engineId) ?? AVAILABLE_ENGINES[0]!;
    const workerPath = import.meta.env.BASE_URL + cfg.workerPath;
    const hash = effectiveHashMb(workerCount, hashMb);

    let pool: EnginePool | null = null;
    try {
      pool = new EnginePool(() => new StockfishService(workerPath, hash), workerCount, signal);

      const result = await analyzeGame({
        fens,
        sanMoves,
        depth,
        pool,
        signal,
        onStage: (stage) => { if (!signal.aborted) dispatch({ type: 'ENGINE_STAGE', stage }); },
        onMove: (move) => { if (!signal.aborted) dispatch({ type: 'MOVE_ANALYZED', move }); },
      });
      if (signal.aborted) return;

      const summary = sanMoves.length > 0 ? buildSummary(result.moves) : null;
      dispatch({ type: 'ANALYSIS_DONE', summary, positionAnalysis: result.lastPosition });

      if (summary && metadata) {
        const saved = saveAnalysisRecord({
          gameId: computeGameId(rawInputRef.current),
          pgn: rawInputRef.current,
          analyzedAt: Date.now(),
          depth,
          engineId,
          moves: result.moves,
          summary,
          fens,
          sanMoves,
          metadata,
        });
        if (!saved.ok) {
          dispatch({
            type: 'STORAGE_WARNING',
            message: 'Analiz geçmişe kaydedilemedi: tarayıcı depolaması dolu. Benchmark sekmesindeki eski kayıtları silerek yer açabilirsiniz.',
          });
        }
      }
    } catch (err) {
      if (signal.aborted || isAbortError(err)) return;
      dispatch({ type: 'ANALYSIS_FAILED', message: (err as Error).message || 'Analiz sırasında bilinmeyen bir hata oluştu.' });
    } finally {
      pool?.terminate();
      if (runRef.current === controller) runRef.current = null;
    }
  }, [cancelRun]);

  const startAnalysis = useCallback(async () => {
    const { fens, sanMoves, metadata } = stateRef.current;
    await runAnalysis({ fens, sanMoves, metadata });
  }, [runAnalysis]);

  const loadAndAnalyze = useCallback((input: string): string | null => {
    const r = installGame(input);
    if ('error' in r) return r.error;
    void runAnalysis(r.game);
    return null;
  }, [installGame, runAnalysis]);

  const stopAnalysis = useCallback(() => {
    cancelRun();
    dispatch({ type: 'ANALYSIS_STOPPED' });
  }, [cancelRun]);

  const navigate  = useCallback((index: number) => dispatch({ type: 'NAVIGATE', index }), []);
  const setDepth  = useCallback((d: number)  => dispatch({ type: 'SET_DEPTH', depth: d }), []);
  const setEngine = useCallback((id: string) => dispatch({ type: 'SET_ENGINE', engineId: id }), []);
  const setWorkerCount = useCallback((n: number)  => dispatch({ type: 'SET_WORKER_COUNT', count: n }), []);
  const setHashMb      = useCallback((mb: number) => dispatch({ type: 'SET_HASH_MB', mb }), []);

  const reset = useCallback(() => {
    cancelRun();
    dispatch({ type: 'RESET' });
  }, [cancelRun]);

  const restoreAnalysis = useCallback((record: AnalysisRecord) => {
    cancelRun();
    rawInputRef.current = record.pgn;
    dispatch({ type: 'RESTORE_ANALYSIS', record });
  }, [cancelRun]);

  const saveCurrentAnalysis = useCallback((): BenchmarkRun | null => {
    const s = stateRef.current;
    if (s.status !== 'done' || !s.summary || !s.metadata || s.moves.length === 0) return null;
    const cfg = AVAILABLE_ENGINES.find((e) => e.id === s.engineId) ?? AVAILABLE_ENGINES[0]!;
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
      state, loadGame, loadAndAnalyze, startAnalysis, stopAnalysis, navigate, reset,
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
