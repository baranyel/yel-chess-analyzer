import { useEffect, useState } from 'react';
import { renderSticker, type StickerOptions } from '../lib/sticker';

export type PieceCode = 'wK' | 'wQ' | 'wR' | 'wB' | 'wN' | 'wP' | 'bK' | 'bQ' | 'bR' | 'bB' | 'bN' | 'bP';

interface Props {
  piece: PieceCode;
  /** Displayed width/height in px. */
  size: number;
  /** Degrees; a slight tilt makes it read as stuck on by hand. */
  rotate?: number;
  /** Adds the hot-colour ring outside the white paper edge. */
  ring?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** A halftone die-cut sticker of a chess piece, generated in the browser from our own piece SVGs. */
export function Sticker({ piece, size, rotate = 0, ring = false, className = '', style }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const opts: Partial<StickerOptions> = ring ? { ring: 8 } : {};
    renderSticker(`${import.meta.env.BASE_URL}pieces/cburnett/${piece}.svg`, opts)
      .then((url) => { if (live) setSrc(url); })
      .catch(() => { /* decorative: stay blank */ });
    return () => { live = false; };
  }, [piece, ring]);

  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style }}
    >
      {src && <img src={src} alt="" width={size} height={size} draggable={false} className="sticker block" />}
    </span>
  );
}
