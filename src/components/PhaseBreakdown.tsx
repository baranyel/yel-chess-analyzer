import type { AnalyzedMove, PgnMetadata } from '../lib/types';
import { computePhaseBreakdown, type PhasePlayerStats } from '../lib/phases';
import { accuracyBg, eloColor } from '../lib/ui';

interface Props {
  moves: AnalyzedMove[];
  metadata: PgnMetadata;
}

const PHASE_LABELS = [
  { key: 'opening'    as const, label: 'Açılış',    range: 'İlk 10 tam hamle' },
  { key: 'middlegame' as const, label: 'Orta Oyun', range: 'Açılıştan oyun sonuna kadar' },
  { key: 'endgame'    as const, label: 'Oyun Sonu', range: 'Figür sayısı azaldıktan sonra' },
];

function PlayerPhaseStats({ stats, name }: { stats: PhasePlayerStats; name: string }) {
  const empty = stats.moveCount === 0;
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1 items-center text-center px-1">
      <div className="text-[10px] text-muted font-semibold truncate w-full">{name}</div>
      {empty ? (
        <span className="text-faint text-[10px]">—</span>
      ) : (
        <>
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
            style={{ backgroundColor: accuracyBg(stats.accuracy), color: '#fff' }}
          >
            {stats.accuracy}%
          </span>
          <span
            className="text-xs font-bold"
            style={{ color: eloColor(stats.estimatedElo) }}
          >
            ~{stats.estimatedElo}
          </span>
          <span className="text-[9px] text-faint">ACPL {stats.acpl}</span>
          <span className="text-[9px] text-faint">{stats.moveCount} hamle</span>
        </>
      )}
    </div>
  );
}

export function PhaseBreakdown({ moves, metadata }: Props) {
  if (moves.length === 0) return null;
  const breakdown = computePhaseBreakdown(moves);

  return (
    <div className="space-y-2 border-t border-base pt-4 mt-2">
      <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider">Faz Analizi</h3>

      {PHASE_LABELS.map(({ key, label }) => {
        const phase = breakdown[key];
        const totalMoves = phase.white.moveCount + phase.black.moveCount;
        return (
          <div key={key} className="rounded border border-base bg-surface-2 px-3 py-2.5 space-y-2">
            {/* Header */}
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-base">{label}</span>
              <span className="text-[9px] text-faint">
                {totalMoves > 0 ? `${totalMoves} hamle` : 'bu fazda hamle yok'}
              </span>
            </div>

            {/* Player columns */}
            <div className="flex gap-2">
              <PlayerPhaseStats stats={phase.white} name={metadata.white} />
              <div className="w-px bg-base shrink-0 self-stretch" />
              <PlayerPhaseStats stats={phase.black} name={metadata.black} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
