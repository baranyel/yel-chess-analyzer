import type { EvalResult } from '../lib/types';

interface Props {
  eval_: EvalResult | null;
  height: number;
}

function fmt(e: EvalResult | null): string {
  if (!e) return '0.0';
  if (e.type === 'mate') return `M${e.value}`;
  const p = e.value / 100;
  return (p >= 0 ? '+' : '') + p.toFixed(1);
}

export function EvalBar({ eval_, height }: Props) {
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
  const evalStr = fmt(eval_);

  return (
    <div
      className="flex flex-col items-center shrink-0"
      style={{ width: 22, height }}
      title={`Değerlendirme: ${evalStr}`}
    >
      <div className="relative w-full flex-1 rounded overflow-hidden" style={{ background: '#e8d9b8' }}>
        {/* Black section (top) */}
        <div
          className="absolute inset-x-0 top-0 transition-all duration-300"
          style={{ height: `${blackPct}%`, background: '#2c2c2c' }}
        />

        {/* Divider label */}
        <div
          className="absolute inset-x-0 flex justify-center pointer-events-none"
          style={{ top: `${blackPct}%`, transform: 'translateY(-50%)' }}
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
