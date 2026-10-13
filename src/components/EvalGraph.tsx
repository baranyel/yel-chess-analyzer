import { useEffect, useMemo, useRef, useState } from 'react';
import { evalGraphGeometry, indexAtX } from '../lib/evalGraph';
import type { AnalyzedMove } from '../lib/types';

const HEIGHT = 64;
// The same two colours as the eval bar next to the board: White's share is light, Black's dark.
const WHITE_SIDE = '#efe6cc';
const BLACK_SIDE = '#2c2c2c';

interface Props {
  moves: AnalyzedMove[];
  /** Position being shown on the board (0 = start). */
  currentIndex: number;
  onSelect: (index: number) => void;
}

/** Who is winning, move by move. Click anywhere to jump to that position. */
export function EvalGraph({ moves, currentIndex, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const geo = useMemo(() => (width > 0 ? evalGraphGeometry(moves, width, HEIGHT) : null), [moves, width]);
  // The wrapper is always rendered (even with nothing to draw yet) so the ResizeObserver
  // above is attached from the start and the graph has a width when the first moves arrive.
  const visible = moves.length >= 2;

  const current = geo?.points.find((p) => p.index === currentIndex);

  return (
    <div ref={wrapRef} className={visible ? 'shrink-0 px-3 pt-3' : 'shrink-0 px-3'}>
      {visible && geo && geo.points.length > 1 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Değerlendirme grafiği. Çizgi yukarıdayken beyaz, aşağıdayken siyah üstündür. Bir noktaya tıklayarak o pozisyona gidin."
          className="block cursor-pointer border border-strong"
          style={{ background: BLACK_SIDE, touchAction: 'none' }}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onSelect(indexAtX(e.clientX - rect.left, width, moves.length));
          }}
        >
          <path d={geo.areaPath} fill={WHITE_SIDE} />
          <line x1={0} x2={width} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="#8c8c8c" strokeWidth={1} strokeDasharray="3 3" />
          <path d={geo.linePath} fill="none" stroke="#111418" strokeWidth={1.5} shapeRendering="crispEdges" />

          {geo.points.map((p) =>
            p.classification === 'blunder' || p.classification === 'mistake' ? (
              <rect
                key={p.index}
                x={p.x - 3}
                y={p.y - 3}
                width={6}
                height={6}
                fill={p.classification === 'blunder' ? 'var(--clr-blunder)' : 'var(--clr-mistake)'}
                stroke="#fff"
                strokeWidth={1}
              />
            ) : null,
          )}

          {current && (
            <>
              <line x1={current.x} x2={current.x} y1={0} y2={HEIGHT} stroke="var(--hot)" strokeWidth={2} />
              <rect x={current.x - 4} y={current.y - 4} width={8} height={8} fill="#fff" stroke="var(--hot)" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
    </div>
  );
}
