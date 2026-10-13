import type { EvalResult } from '../lib/types';
import { formatEval } from '../lib/format';

interface Props {
  eval_: EvalResult | null;
  height: number;
  /** true when Black is at the bottom of the board: White's share is then drawn at the top. */
  flipped?: boolean;
}

export function EvalBar({ eval_, height, flipped = false }: Props) {
  const MAX_CP = 900;

  let whitePct = 50;
  if (eval_) {
    if (eval_.type === 'mate') {
      whitePct = eval_.value > 0 ? 97 : 3;
    } else {
      const c = Math.max(-MAX_CP, Math.min(MAX_CP, eval_.value));
      whitePct = 50 + (c / MAX_CP) * 45;
    }
  }

  const blackPct = 100 - whitePct;
  const isMate = eval_?.type === 'mate';
  const evalStr = eval_ ? formatEval(eval_, 1) : '0.0';

  // Black's block sits at the top normally and at the bottom when the board is flipped.
  const blackAnchor = flipped ? { bottom: 0 } : { top: 0 };
  const dividerAnchor = flipped
    ? { bottom: `${blackPct}%`, transform: 'translateY(50%)' }
    : { top: `${blackPct}%`, transform: 'translateY(-50%)' };

  return (
    <div
      className="flex flex-col items-center shrink-0"
      style={{ width: 22, height }}
      title={`Değerlendirme: ${evalStr}`}
    >
      <div className="relative w-full flex-1 rounded overflow-hidden" style={{ background: '#e8d9b8' }}>
        {/* Black section */}
        <div
          className="absolute inset-x-0 transition-all duration-300"
          style={{ ...blackAnchor, height: `${blackPct}%`, background: '#2c2c2c' }}
        />

        {/* Divider label */}
        <div
          className="absolute inset-x-0 flex justify-center pointer-events-none"
          style={dividerAnchor}
        >
          <span
            className="text-[8px] font-bold leading-none px-0.5"
            style={{
              color: isMate ? '#fbbf24' : whitePct > 70 ? '#2c2c2c' : '#e8d9b8',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              userSelect: 'none',
            }}
          >
            {evalStr}
          </span>
        </div>
      </div>
    </div>
  );
}
