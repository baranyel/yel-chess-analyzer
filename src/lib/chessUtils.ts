import { Chess } from 'chess.js';

/** UCI move ("e2e4", "e7e8q") → SAN in the given position; falls back to the UCI text. */
export function uciToSan(fen: string, uci: string): string {
  if (uci.length < 4) return uci;
  try {
    const m = new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return m.san;
  } catch {
    return uci;
  }
}
