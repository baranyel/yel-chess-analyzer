import type { PgnMetadata } from './types';

/**
 * Which side should be at the bottom when a game is opened? Black, if the
 * viewer (one of the saved Lichess / Chess.com usernames) played Black and not White.
 */
export function defaultOrientation(
  metadata: PgnMetadata | null,
  usernames: Array<string | undefined>,
): 'white' | 'black' {
  if (!metadata) return 'white';
  const names = usernames.map((n) => n?.trim().toLowerCase()).filter((n): n is string => !!n);
  const isWhite = names.includes(metadata.white.trim().toLowerCase());
  const isBlack = names.includes(metadata.black.trim().toLowerCase());
  return isBlack && !isWhite ? 'black' : 'white';
}

/** Pixel offset of a square's top-left corner, for either board orientation. */
export function squareToOffset(square: string, boardSize: number, orientation: 'white' | 'black') {
  const file = square.charCodeAt(0) - 97;         // 'a'=0 … 'h'=7
  const rank = parseInt(square[1]!, 10);          // '1'=1 … '8'=8
  const sz = boardSize / 8;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 8 - rank : rank - 1;
  return { x: col * sz, y: row * sz };
}

/**
 * Where to put a classification badge for a move ending on `square`: the
 * square's top-right corner, pulled back inside the board so it never spills
 * over the edge (h-file / 8th rank).
 */
export function badgePosition(
  square: string,
  boardSize: number,
  orientation: 'white' | 'black',
  badge: number,
) {
  const sz = boardSize / 8;
  const { x, y } = squareToOffset(square, boardSize, orientation);
  const left = Math.min(x + sz - badge * 0.65, boardSize - badge);
  const top = Math.max(y - badge * 0.35, 0);
  return { left: Math.max(left, 0), top };
}
