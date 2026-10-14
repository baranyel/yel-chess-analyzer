import calibration from './calibration.json';

// Chess.com ↔ Lichess rating conversion, measured by equating quality of play:
// games from both sites analysed with the same engine and depth, and ratings
// with the same expected accuracy matched (scripts/calibrate/scale.mjs).

/** The rating pools that have a conversion table (Chess.com time classes). */
export type ScaleSpeed = 'blitz' | 'rapid';

interface Row { chesscom: number; lichess: number; se: number }

export interface Converted {
  rating: number;
  /** Standard error of the conversion itself (bootstrap), rating points. */
  se: number;
  /** Outside the measured range: the nearest row's offset was carried over. */
  extrapolated: boolean;
}

const TABLES: Record<ScaleSpeed, Row[]> = calibration.scaleConversion;

export const SCALE_SOURCE = calibration.scaleConversion.source;

/** Speed whose table converts a game of this speed (Lichess classical ≈ Chess.com rapid). */
export function scaleSpeed(speed: string | null | undefined): ScaleSpeed | null {
  if (speed === 'blitz') return 'blitz';
  if (speed === 'rapid' || speed === 'classical') return 'rapid';
  return null;
}

export function hasConversion(speed: ScaleSpeed | null): speed is ScaleSpeed {
  return speed !== null && TABLES[speed].length >= 2;
}

function convert(rows: Row[], r: number, from: 'chesscom' | 'lichess', to: 'chesscom' | 'lichess'): Converted {
  const first = rows[0]!, last = rows[rows.length - 1]!;
  if (r <= first[from]) return { rating: Math.round(r + first[to] - first[from]), se: first.se, extrapolated: r < first[from] };
  if (r >= last[from]) return { rating: Math.round(r + last[to] - last[from]), se: last.se, extrapolated: r > last[from] };
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!, b = rows[i]!;
    if (r <= b[from]) {
      const t = (r - a[from]) / (b[from] - a[from] || 1);
      return { rating: Math.round(a[to] + t * (b[to] - a[to])), se: Math.round(a.se + t * (b.se - a.se)), extrapolated: false };
    }
  }
  return { rating: Math.round(r), se: last.se, extrapolated: true };
}

/** Chess.com rating → Lichess equivalent; null without a table for this speed. */
export function chesscomToLichess(rating: number, speed: ScaleSpeed | null): Converted | null {
  return hasConversion(speed) ? convert(TABLES[speed], rating, 'chesscom', 'lichess') : null;
}

/** Lichess rating → Chess.com equivalent; null without a table for this speed. */
export function lichessToChesscom(rating: number, speed: ScaleSpeed | null): Converted | null {
  return hasConversion(speed) ? convert(TABLES[speed], rating, 'lichess', 'chesscom') : null;
}

/** d(chess.com) / d(lichess) around `lichessRating`, to carry a Lichess-scale error over. */
export function conversionSlope(lichessRating: number, speed: ScaleSpeed): number {
  const lo = lichessToChesscom(lichessRating - 50, speed)!, hi = lichessToChesscom(lichessRating + 50, speed)!;
  return Math.max(0.3, (hi.rating - lo.rating) / 100);
}
