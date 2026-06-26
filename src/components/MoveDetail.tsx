import type { AnalyzedMove } from '../lib/types';
import { CLASSIFICATION_STYLES } from '../lib/classification';

function fmtEval(e: { type: 'cp' | 'mate'; value: number } | null): string {
  if (!e) return '?';
  if (e.type === 'mate') return e.value > 0 ? `M${e.value}` : `M${e.value}`;
  const p = e.value / 100;
  return (p >= 0 ? '+' : '') + p.toFixed(2);
}

function cpLossColor(loss: number): string {
  if (loss > 100) return 'var(--clr-blunder)';
  if (loss > 50)  return 'var(--clr-mistake)';
  if (loss > 20)  return 'var(--clr-inaccuracy)';
  return 'var(--clr-excellent)';
}

interface Props {
  move: AnalyzedMove | null;
}

export function MoveDetail({ move }: Props) {
  if (!move) {
    return (
      <div className="text-[11px] text-faint px-2 py-1">
        Bir hamle seçin.
      </div>
    );
  }

  const style = CLASSIFICATION_STYLES[move.classification];

  return (
    <div className="bg-surface border border-base rounded-lg px-3 py-2.5 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-bold text-base" style={{ color: style.color }}>{style.icon}</span>
        <span className="font-semibold" style={{ color: style.color }}>{style.labelTr}</span>
        <span className="ml-auto text-faint font-mono text-[11px]">
          {move.moveNumber}. {move.color === 'b' ? '…' : ''}{move.san}
        </span>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div>
          <div className="text-faint text-[10px]">Önce</div>
          <div className="font-mono text-base">{fmtEval(move.evalBefore)}</div>
        </div>
        <div>
          <div className="text-faint text-[10px]">Sonra</div>
          <div className="font-mono text-base">{fmtEval(move.evalAfter)}</div>
        </div>
        <div>
          <div className="text-faint text-[10px]">CP kaybı</div>
          <div className="font-mono font-bold" style={{ color: cpLossColor(move.cpLoss) }}>
            {move.cpLoss.toFixed(0)}
          </div>
        </div>
        {move.bestMove && move.bestMove !== move.uci && (
          <div className="ml-auto">
            <div className="text-faint text-[10px]">En iyi</div>
            <div className="font-mono text-accent">{move.bestMove}</div>
          </div>
        )}
      </div>

      {move.commentary && (
        <div className="text-muted italic border-t border-base pt-2 leading-relaxed">
          {move.commentary}
        </div>
      )}
    </div>
  );
}
