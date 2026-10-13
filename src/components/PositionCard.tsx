import type { PositionAnalysis } from '../lib/types';
import { uciToSan } from '../lib/chessUtils';
import { formatEval } from '../lib/format';

interface Props {
  fen: string;
  /** null until the engine has answered. */
  analysis: PositionAnalysis | null;
  analyzing: boolean;
}

/** Engine verdict for a single position (FEN mode): evaluation, best move and alternatives. */
export function PositionCard({ fen, analysis, analyzing }: Props) {
  if (!analysis) {
    return (
      <div className="bg-surface border border-base rounded-lg px-3 py-2.5 text-xs text-faint">
        {analyzing
          ? 'Pozisyon analiz ediliyor…'
          : '«Pozisyonu Analiz Et» ile motorun değerlendirmesini görün.'}
      </div>
    );
  }

  const lines = [
    { uci: analysis.bestMove, ev: analysis.eval },
    ...analysis.alternatives.map((uci, i) => ({ uci, ev: analysis.alternativeEvals[i]! })),
  ].filter((l) => l.uci);

  return (
    <div className="bg-surface border border-base rounded-lg px-3 py-2.5 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-base">Pozisyon Analizi</span>
        <span className="text-faint font-mono text-[11px]">derinlik {analysis.depth}</span>
      </div>

      {lines.length === 0 ? (
        <div className="text-muted">
          Bu pozisyonda yasal hamle yok ({formatEval(analysis.eval)}).
        </div>
      ) : (
        <ol className="space-y-1">
          {lines.map((l, i) => (
            <li key={l.uci} className="flex items-center gap-2">
              <span className="text-faint w-4 text-right">{i + 1}.</span>
              <span className={`font-mono font-semibold ${i === 0 ? 'text-accent' : 'text-base'}`}>
                {uciToSan(fen, l.uci)}
              </span>
              <span className="ml-auto font-mono text-muted">{formatEval(l.ev)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
