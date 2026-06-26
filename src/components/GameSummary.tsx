import type { GameSummaryStats, PgnMetadata } from '../lib/types';
import { CLASSIFICATION_STYLES } from '../lib/classification';

interface Props {
  summary: GameSummaryStats;
  metadata: PgnMetadata;
}

// Fixed pill colors — dark enough for white text on every theme
const ACC_COLORS = [
  { min: 90, bg: '#15803d' },  // green-700
  { min: 75, bg: '#3f6212' },  // lime-800
  { min: 60, bg: '#a16207' },  // yellow-700
  { min: 45, bg: '#c2410c' },  // orange-700
  { min: 0,  bg: '#b91c1c' },  // red-700
] as const;

function accBg(value: number): string {
  return ACC_COLORS.find((c) => value >= c.min)!.bg;
}

function AccuracyPill({ value }: { value: number }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-bold"
      style={{ backgroundColor: accBg(value), color: '#ffffff' }}
    >
      {value}% doğruluk
    </span>
  );
}

function EloRing({ elo }: { elo: number }) {
  const colorVar =
    elo >= 2400 ? '--clr-elo-5' :
    elo >= 2000 ? '--clr-elo-4' :
    elo >= 1700 ? '--clr-elo-3' :
    elo >= 1400 ? '--clr-elo-2' :
                  '--clr-elo-1';
  const color = `var(${colorVar})`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold border-4"
        style={{ borderColor: color, color }}
      >
        {elo}
      </div>
      <span className="text-[10px] text-faint">FIDE tahmini</span>
    </div>
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
      <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider">Maç Özeti</h3>

      {/* Players */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="space-y-1">
          <div className="font-semibold text-xs text-base truncate" title={metadata.white}>{metadata.white}</div>
          {metadata.whiteElo && <div className="text-[10px] text-muted">({metadata.whiteElo})</div>}
          <AccuracyPill value={summary.white.accuracy} />
          <div className="flex justify-center mt-2">
            <EloRing elo={summary.white.estimatedElo} />
          </div>
          <div className="text-[10px] text-faint">ACPL: {summary.white.acpl}</div>
        </div>

        <div className="flex items-center justify-center">
          <span className="text-muted text-xs font-bold">{metadata.result}</span>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-xs text-base truncate" title={metadata.black}>{metadata.black}</div>
          {metadata.blackElo && <div className="text-[10px] text-muted">({metadata.blackElo})</div>}
          <AccuracyPill value={summary.black.accuracy} />
          <div className="flex justify-center mt-2">
            <EloRing elo={summary.black.estimatedElo} />
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
    </div>
  );
}
