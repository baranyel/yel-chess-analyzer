import type { PgnMetadata } from '../lib/types';

export type Side = 'white' | 'black';

export const SIDE_LABELS: Record<Side, string> = { white: 'Beyaz', black: 'Siyah' };

/** A small disc in the colour of the side, so it reads the same on every theme. */
export function SideChip({ side, size = 12 }: { side: Side; size?: number }) {
  return (
    <span
      role="img"
      aria-label={SIDE_LABELS[side]}
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: side === 'white' ? '#ffffff' : '#1b1b1b',
        border: '1.5px solid #7a7a7a',
        boxShadow: '0 1px 0 rgba(0,20,70,.35)',
      }}
    />
  );
}

/** Side chip + name + rating, e.g. above or below the board. */
export function PlayerBar({
  side,
  metadata,
  active,
}: {
  side: Side;
  metadata: PgnMetadata;
  /** This side is to move in the position shown. */
  active?: boolean;
}) {
  const name = side === 'white' ? metadata.white : metadata.black;
  const rating = side === 'white' ? metadata.whiteElo : metadata.blackElo;
  return (
    <div className="flex items-center gap-2 min-w-0 text-xs h-6" aria-label={`${SIDE_LABELS[side]}: ${name}`}>
      <SideChip side={side} size={14} />
      <span className="font-semibold text-base truncate" title={name}>{name}</span>
      {rating && <span className="text-muted shrink-0">({rating})</span>}
      <span className="text-faint text-[10px] shrink-0">{SIDE_LABELS[side]}</span>
      {active && <span className="ml-auto text-[10px] text-accent font-semibold shrink-0" title="Sıra bu tarafta">● sıra</span>}
    </div>
  );
}
