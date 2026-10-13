import type { EvalResult } from './types';

/** "+0.35", "-1.2", "M3" (White's point of view). `digits` is the number of decimals for centipawns. */
export function formatEval(e: EvalResult | null, digits = 2): string {
  if (!e) return '?';
  if (e.type === 'mate') return `M${e.value}`;
  const pawns = e.value / 100;
  return (pawns >= 0 ? '+' : '') + pawns.toFixed(digits);
}
