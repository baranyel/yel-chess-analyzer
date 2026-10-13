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

/** Logical CPU cores reported by the browser (4 when it does not say). */
export function logicalCores(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
  return cores && cores > 0 ? cores : 4;
}

/** Half the logical cores (leave room for the UI), between 1 and 4. */
export function defaultWorkerCount(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  if (!cores || cores < 2) return 1;
  return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}

const WORKER_CHOICES = [1, 2, 4, 8, 12, 16];

/** Worker counts to offer: those the machine can plausibly run, plus the current selection. */
export function workerOptions(current: number): number[] {
  const cores = logicalCores();
  const options = new Set(WORKER_CHOICES.filter((n) => n <= cores));
  options.add(1);
  options.add(current);
  return [...options].sort((a, b) => a - b);
}
