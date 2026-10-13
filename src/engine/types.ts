import type { PositionAnalysis } from '../lib/types';

/** Result of one engine search, scores normalised to White's point of view. */
export interface AnalysisResult extends PositionAnalysis {
  fen: string;
}

/**
 * Minimal engine surface the analysis pipeline depends on.
 * StockfishService implements it; tests use an in-memory fake.
 */
export interface Engine {
  /** Resolves once the engine answered `isready`; rejects if it fails to load. */
  readonly ready: Promise<void>;
  /** One search at a time. Rejects with EngineError / AbortError on failure. */
  analyze(fen: string, depth: number, multiPv: number): Promise<AnalysisResult>;
  /** Kills the engine and rejects anything still pending with an AbortError. */
  terminate(): void;
}

export type EngineStage = 'loading-engine' | 'analyzing';

/** The engine failed to load, crashed, or timed out. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

export function createAbortError(message = 'Analiz iptal edildi.'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}
