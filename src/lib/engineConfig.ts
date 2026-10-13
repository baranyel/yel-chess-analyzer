// Shared engine settings. Keep the numbers here so the UI and the analysis
// pipeline can never disagree about them.

// Whole-game analysis only needs the best line and the runner-up (used for the
// "only move" classification); the position card (FEN mode) shows three lines.
export const MULTI_PV_GAME = 2;
export const MULTI_PV_POSITION = 3;

// Each Stockfish WASM instance carries ~110 MB of NNUE weights on top of its
// hash table, so the *total* hash across all workers is capped.
const TOTAL_HASH_BUDGET_MB = 512;
const MIN_HASH_MB = 16;

export function effectiveHashMb(workerCount: number, hashMb: number): number {
  return Math.max(MIN_HASH_MB, Math.min(hashMb, Math.floor(TOTAL_HASH_BUDGET_MB / Math.max(1, workerCount))));
}

/** Half the logical cores (leave room for the UI), between 1 and 4. */
export function defaultWorkerCount(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  if (!cores || cores < 2) return 1;
  return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}
