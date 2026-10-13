import { Chess } from 'chess.js';

/** "e2e4" → { from: 'e2', to: 'e4' }; null for anything that is not a UCI move. */
export function uciSquares(uci: string | null | undefined): { from: string; to: string } | null {
  if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

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
