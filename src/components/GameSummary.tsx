import type { GameSummaryStats, PgnMetadata, PlayerStats } from '../lib/types';
import { CLASSIFICATION_STYLES } from '../lib/classification';
import { headlineEstimate } from '../lib/performance/estimate';
import { accuracyBg, eloColor } from '../lib/ui';
import { PerformanceDetails, TimeManagementCard } from './PerformanceDetails';
import { SIDE_LABELS, SideChip, type Side } from './PlayerTag';

interface Props {
  summary: GameSummaryStats;
  metadata: PgnMetadata;
}

function AccuracyPill({ value }: { value: number }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-bold"
      style={{ backgroundColor: accuracyBg(value), color: '#ffffff' }}
    >
      {value}% doğruluk
    </span>
  );
}

function EloRing({ stats }: { stats: PlayerStats }) {
  if (stats.ratingOutOfScope) {
    return (
      <span className="text-[10px] text-faint" title="Modeller blitz, rapid ve klasik maçlarla kalibre edildi">
        Bullet/günlük maç: tahmin yok
      </span>
    );
  }
  const head = stats.performance ? headlineEstimate(stats.performance) : null;
  const elo = head?.rating ?? stats.estimatedElo;
  if (!elo) return <span className="text-[10px] text-faint">Tahmin için hamle az</span>;
  const color = eloColor(elo);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-14 h-14 rounded-full flex flex-col items-center justify-center text-sm font-bold border-4"
        style={{ borderColor: color, color }}
      >
        <span className="leading-none">{elo}</span>
        {head && <span className="text-[8px] font-normal text-faint mt-0.5">±{Math.round(1.2816 * head.error)}</span>}
      </div>
      <span className="text-[10px] text-faint" title="Tek maçtan tahmin: geniş hata payı">Performans (tek maç)</span>
    </div>
  );
}

/** Side colour + name (+ rating) at the head of each summary column. */
function PlayerHeading({ side, name, rating }: { side: Side; name: string; rating?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted">
        <SideChip side={side} />
        {SIDE_LABELS[side]}
      </div>
      <div className="font-semibold text-xs text-base truncate" title={name}>{name}</div>
      {rating && <div className="text-[10px] text-muted">({rating})</div>}
    </div>
  );
}

function SideDetails({ side, name, stats }: { side: Side; name: string; stats: PlayerStats }) {
  if (!stats.performance && !stats.timeManagement) return null;
  return (
    <details className="border border-base rounded px-3 py-2">
      <summary className="text-xs font-semibold text-base cursor-pointer truncate">
        <SideChip side={side} /> <span className="ml-1">{name}: performans ve zaman</span>
      </summary>
      <div className="space-y-3 pt-3">
        {stats.performance && <PerformanceDetails performance={stats.performance} />}
        {stats.timeManagement && (
          <div className="border-t border-base pt-3">
            <p className="section-title text-base mb-2">Zaman yönetimi</p>
            <TimeManagementCard result={stats.timeManagement} />
          </div>
        )}
      </div>
    </details>
  );
}

const STAT_ROWS: Array<{ key: keyof typeof CLASSIFICATION_STYLES }> = [
  { key: 'kusursuz' },
  { key: 'muhtesem' },
  { key: 'best' },
  { key: 'excellent' },
  { key: 'good' },
  { key: 'inaccuracy' },
  { key: 'mistake' },
  { key: 'blunder' },
];

export function GameSummary({ summary, metadata }: Props) {
  return (
    <div className="space-y-4 text-sm">
      <h3 className="section-title text-base">Maç özeti</h3>

      {/* Players */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="space-y-1">
          <PlayerHeading side="white" name={metadata.white} rating={metadata.whiteElo} />
          <AccuracyPill value={summary.white.accuracy} />
          <div className="flex justify-center mt-2">
            <EloRing stats={summary.white} />
          </div>
          <div className="text-[10px] text-faint">ACPL: {summary.white.acpl}</div>
        </div>

        <div className="flex items-center justify-center">
          <span className="text-muted text-xs font-bold">{metadata.result}</span>
        </div>

        <div className="space-y-1">
          <PlayerHeading side="black" name={metadata.black} rating={metadata.blackElo} />
          <AccuracyPill value={summary.black.accuracy} />
          <div className="flex justify-center mt-2">
            <EloRing stats={summary.black} />
          </div>
          <div className="text-[10px] text-faint">ACPL: {summary.black.acpl}</div>
        </div>
      </div>

      {/* Stats table */}
      <div className="space-y-1 border-t border-base pt-3">
        {STAT_ROWS.map(({ key }) => {
          const style = CLASSIFICATION_STYLES[key];
          const wVal = (summary.white as unknown as Record<string, number>)[key] ?? 0;
          const bVal = (summary.black as unknown as Record<string, number>)[key] ?? 0;
          if (wVal === 0 && bVal === 0 && (key === 'kusursuz' || key === 'muhtesem')) return null;
          return (
            <div key={key} className="grid grid-cols-3 gap-1 items-center text-xs">
              <div
                className="text-right font-mono font-bold"
                style={{ color: wVal > 0 ? style.color : 'var(--text-faint)' }}
              >
                {wVal}
              </div>
              <div className="flex items-center justify-center gap-1" style={{ color: style.color }}>
                <span className="font-bold">{style.icon}</span>
                <span className="text-muted text-[10px]">{style.labelTr}</span>
              </div>
              <div
                className="text-left font-mono font-bold"
                style={{ color: bVal > 0 ? style.color : 'var(--text-faint)' }}
              >
                {bVal}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-base pt-3">
        <SideDetails side="white" name={metadata.white} stats={summary.white} />
        <SideDetails side="black" name={metadata.black} stats={summary.black} />
      </div>
    </div>
  );
}
