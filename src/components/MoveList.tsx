import { useRef, useEffect } from 'react';
import type { AnalyzedMove } from '../lib/types';
import { CLASSIFICATION_STYLES } from '../lib/classification';

interface Props {
  moves: AnalyzedMove[];
  sanMoves: string[];
  currentIndex: number;
  totalMoves: number;
  analyzedCount: number;
  onSelect: (index: number) => void;
}

function fmtEval(move: AnalyzedMove): string {
  const e = move.evalAfter;
  if (!e) return '';
  if (e.type === 'mate') return `M${e.value}`;
  const p = e.value / 100;
  return (p >= 0 ? '+' : '') + p.toFixed(1);
}

export function MoveList({ moves, sanMoves, currentIndex, totalMoves, onSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  const pairs: Array<{
    number: number;
    white: { san: string; analyzed: AnalyzedMove | null; idx: number } | null;
    black: { san: string; analyzed: AnalyzedMove | null; idx: number } | null;
  }> = [];

  for (let i = 0; i < totalMoves; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: i < totalMoves ? { san: sanMoves[i], analyzed: moves[i] ?? null, idx: i } : null,
      black: i + 1 < totalMoves ? { san: sanMoves[i + 1], analyzed: moves[i + 1] ?? null, idx: i + 1 } : null,
    });
  }

  const renderCell = (
    cell: { san: string; analyzed: AnalyzedMove | null; idx: number } | null,
  ) => {
    if (!cell) return <div className="flex-1" />;
    const { san, analyzed, idx } = cell;
    const isActive = currentIndex === idx + 1;
    const style = analyzed ? CLASSIFICATION_STYLES[analyzed.classification] : null;
    const evalStr = analyzed ? fmtEval(analyzed) : '';

    return (
      <button
        ref={isActive ? activeRef : undefined}
        onClick={() => onSelect(idx + 1)}
        className={[
          'flex-1 flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors text-left',
          isActive ? '' : 'text-base hover-surface',
        ].join(' ')}
        style={isActive ? { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' } : {}}
      >
        {style ? (
          <span
            className="text-xs font-bold shrink-0 w-4 text-center"
            title={style.labelTr}
            style={{ color: isActive ? 'var(--accent-text)' : style.color }}
          >
            {style.icon}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span className="font-medium truncate">{san}</span>

        {evalStr && (
          <span
            className="ml-auto text-[10px] font-mono shrink-0"
            style={{ color: isActive ? 'var(--accent-text)' : 'var(--text-faint)' }}
          >
            {evalStr}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="overflow-y-auto px-2 py-1 h-full" style={{ overscrollBehavior: 'contain' }}>
      <div className="space-y-0.5">
        {pairs.map(({ number, white, black }) => (
          <div key={number} className="flex items-stretch gap-1">
            <span className="w-7 shrink-0 text-[10px] text-faint flex items-center justify-end pr-1 font-mono">
              {number}.
            </span>
            {renderCell(white)}
            {renderCell(black)}
          </div>
        ))}
      </div>
    </div>
  );
}
