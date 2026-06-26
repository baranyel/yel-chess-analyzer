import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useEffect,
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
import type { AnalyzedMove, GameSummaryStats, PgnMetadata, EvalResult } from '../lib/types';

const DEFAULT_DEPTH = 18;
const MULTI_PV = 3;

// ── Status ────────────────────────────────────────────────────────────────
export type AnalysisStatus = 'idle' | 'ready' | 'analyzing' | 'done' | 'error';

// ── State ─────────────────────────────────────────────────────────────────
interface AnalysisState {
  status: AnalysisStatus;
  error: string | null;
  metadata: PgnMetadata | null;
  moves: AnalyzedMove[];       // analyzed moves (grows during analysis)
  sanMoves: string[];           // all SAN moves from PGN (available after 'ready')
  fens: string[];               // fen[0]=start, fen[i]=after move i
  currentIndex: number;
  analyzedCount: number;
  totalMoves: number;
  summary: GameSummaryStats | null;
  depth: number;
  engineId: string;
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
};

// ── Actions ───────────────────────────────────────────────────────────────
type Action =
  | { type: 'GAME_LOADED'; metadata: PgnMetadata; fens: string[]; sanMoves: string[] }
  | { type: 'ANALYSIS_STARTED' }
  | { type: 'MOVE_ANALYZED'; move: AnalyzedMove }
  | { type: 'ANALYSIS_DONE'; summary: GameSummaryStats }
  | { type: 'ERROR'; message: string }
  | { type: 'NAVIGATE'; index: number }
  | { type: 'SET_DEPTH'; depth: number }
  | { type: 'SET_ENGINE'; engineId: string }
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

    case 'RESET':
      return { ...initialState, depth: state.depth, engineId: state.engineId };

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
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const engineRef = useRef<StockfishService | null>(null);
  const abortRef = useRef(false);

  // Re-create engine when engineId changes
  useEffect(() => {
    engineRef.current?.terminate();
    const cfg = AVAILABLE_ENGINES.find((e) => e.id === state.engineId) ?? AVAILABLE_ENGINES[0];
    engineRef.current = new StockfishService(import.meta.env.BASE_URL + cfg.workerPath);
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, [state.engineId]);

  // ── loadGame: parse PGN/FEN, transition to 'ready' ──────────────────
  const loadGame = useCallback((input: string) => {
    abortRef.current = true;
    const trimmed = input.trim();
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
    });
  }, []);

  // ── startAnalysis: run Stockfish on every position ───────────────────
  const startAnalysis = useCallback(async () => {
    const { fens, sanMoves, depth } = stateRef.current;
    if (!fens.length || !sanMoves.length) return;

    abortRef.current = false;
    dispatch({ type: 'ANALYSIS_STARTED' });

    const engine = engineRef.current;
    if (!engine) {
      dispatch({ type: 'ERROR', message: 'Motor başlatılamadı.' });
      return;
    }

    const chess = new Chess();
    const evalCache: (EvalResult | null)[] = new Array(fens.length).fill(null);
    const bestMoves: (string | null)[] = new Array(fens.length).fill(null);
    const altMoves: string[][] = new Array(fens.length).fill([]);
    const altEvals: (EvalResult[])[] = new Array(fens.length).fill([]);

    const analyzePos = (idx: number): Promise<void> =>
      new Promise((resolve) => {
        if (abortRef.current) { resolve(); return; }
        engine.analyze(fens[idx], depth, MULTI_PV, (result) => {
          if (abortRef.current) { resolve(); return; }
          evalCache[idx] = result.eval;
          bestMoves[idx] = result.bestMove;
          altMoves[idx] = result.alternatives;
          altEvals[idx] = result.alternativeEvals;
          resolve();
        });
      });

    // Analyze starting position
    await analyzePos(0);
    if (abortRef.current) return;

    const analyzedMoves: AnalyzedMove[] = [];

    for (let i = 0; i < sanMoves.length; i++) {
      if (abortRef.current) return;

      await analyzePos(i + 1);
      if (abortRef.current) return;

      const move = chess.move(sanMoves[i]);
      const color: 'w' | 'b' = move.color;

      const evalBefore = evalCache[i];   // eval at position before move (best line)
      const evalAfter  = evalCache[i + 1]; // eval after played move

      // cpLoss: how much worse the played move is vs the best move
      // evalBefore = best achievable outcome from position i
      // evalAfter  = actual outcome (opponent's turn, white POV)
      let cpLoss = 0;
      if (evalBefore && evalAfter) {
        cpLoss = computeCpLoss(evalBefore, evalAfter, color);
      }

      // secondBestCpLoss: how much worse the 2nd-best alternative is vs best
      let secondBestCpLoss = 9999;
      const alt2Eval = altEvals[i]?.[0] ?? null; // 2nd-best line eval at position i
      if (evalBefore && alt2Eval) {
        // alt2Eval is the eval if the 2nd-best move had been played (from white POV)
        secondBestCpLoss = computeSecondBestCpLoss(evalBefore, alt2Eval, color);
      }

      const uci = move.lan ?? '';
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
    }

    dispatch({ type: 'ANALYSIS_DONE', summary: buildSummary(analyzedMoves) });
  }, []);

  const navigate = useCallback((index: number) => dispatch({ type: 'NAVIGATE', index }), []);
  const reset    = useCallback(() => { abortRef.current = true; dispatch({ type: 'RESET' }); }, []);
  const setDepth = useCallback((d: number) => dispatch({ type: 'SET_DEPTH', depth: d }), []);
  const setEngine = useCallback((id: string) => dispatch({ type: 'SET_ENGINE', engineId: id }), []);

  return (
    <AnalysisContext.Provider value={{ state, loadGame, startAnalysis, navigate, reset, setDepth, setEngine }}>
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
      kusursuz:  count('kusursuz'),
      muhtesem:  count('muhtesem'),
      best:      count('best'),
      excellent: count('excellent'),
      good:      count('good'),
      inaccuracy:count('inaccuracy'),
      mistake:   count('mistake'),
      blunder:   count('blunder'),
      accuracy:  computeAccuracy(ms),
      acpl,
      estimatedElo: estimateElo(acpl),
    };
  };
  return { white: build('w'), black: build('b') };
}
