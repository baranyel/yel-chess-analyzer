import type { AccountAnalysisResult } from '../lib/accountAnalysis';
import type { PlayerPhaseBreakdown, PhasePlayerStats } from '../lib/phases';

interface Props {
  result: AccountAnalysisResult;
  onClose: () => void;
}

const ACC_COLORS = [
  { min: 90, bg: '#15803d' },
  { min: 75, bg: '#3f6212' },
  { min: 60, bg: '#a16207' },
  { min: 45, bg: '#c2410c' },
  { min: 0,  bg: '#b91c1c' },
] as const;

function accBg(v: number) { return ACC_COLORS.find((c) => v >= c.min)!.bg; }

function eloColor(elo: number) {
  if (elo >= 2400) return 'var(--clr-elo-5)';
  if (elo >= 2000) return 'var(--clr-elo-4)';
  if (elo >= 1700) return 'var(--clr-elo-3)';
  if (elo >= 1400) return 'var(--clr-elo-2)';
  return 'var(--clr-elo-1)';
}

function PhaseRow({ label, stats }: { label: string; stats: PhasePlayerStats }) {
  const empty = stats.moveCount === 0;
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-[10px] text-muted w-20 shrink-0">{label}</span>
      {empty ? (
        <span className="text-faint text-[10px]">— hamle yok</span>
      ) : (
        <>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
            style={{ backgroundColor: accBg(stats.accuracy), color: '#fff' }}
          >
            {stats.accuracy}%
          </span>
          <span className="text-xs font-bold" style={{ color: eloColor(stats.estimatedElo) }}>
            ~{stats.estimatedElo}
          </span>
          <span className="text-[10px] text-faint ml-auto">{stats.moveCount} ham</span>
        </>
      )}
    </div>
  );
}

const PHASE_LABELS: Array<{ key: keyof PlayerPhaseBreakdown; label: string }> = [
  { key: 'opening',    label: 'Açılış' },
  { key: 'middlegame', label: 'Orta Oyun' },
  { key: 'endgame',    label: 'Oyun Sonu' },
];

export function AccountAnalysisResultCard({ result, onClose }: Props) {
  const { stats, phaseBreakdown, gamesAnalyzed, username } = result;
  const eloClr = eloColor(stats.estimatedElo);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Header */}
      <div>
        <h3 className="text-xs font-bold text-base truncate">{username}</h3>
        <p className="text-[10px] text-faint">{gamesAnalyzed} maç analiz edildi</p>
      </div>

      {/* Elo ring + accuracy */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-lg font-bold border-4"
            style={{ borderColor: eloClr, color: eloClr }}
          >
            {stats.estimatedElo}
          </div>
          <span className="text-[10px] text-faint">FIDE tahmini</span>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted">Doğruluk</span>
            <span
              className="font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: accBg(stats.accuracy), color: '#fff' }}
            >
              {stats.accuracy}%
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Ort. Kayıp (ACPL)</span>
            <span className="font-bold text-base">{stats.acpl}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Toplam Hamle</span>
            <span className="font-bold text-base">
              {stats.kusursuz + stats.muhtesem + stats.best + stats.excellent +
               stats.good + stats.inaccuracy + stats.mistake + stats.blunder}
            </span>
          </div>
        </div>
      </div>

      {/* Phase breakdown */}
      <div className="border-t border-base pt-3">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
          Faz Bazlı Rating
        </p>
        <div className="divide-y divide-base border border-base rounded overflow-hidden">
          {PHASE_LABELS.map(({ key, label }) => (
            <div key={key} className="px-3 bg-surface-2">
              <PhaseRow label={label} stats={phaseBreakdown[key]} />
            </div>
          ))}
        </div>
      </div>

      {/* Classification summary */}
      <div className="border-t border-base pt-3">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
          Hamle Dağılımı
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          {[
            { label: 'Muhteşem / Kusursuz', val: stats.muhtesem + stats.kusursuz, color: 'var(--clr-brilliant)' },
            { label: 'En İyi', val: stats.best, color: 'var(--clr-best)' },
            { label: 'Mükemmel / İyi', val: stats.excellent + stats.good, color: 'var(--clr-good)' },
            { label: 'Hamle (?!)', val: stats.inaccuracy, color: 'var(--clr-inaccuracy)' },
            { label: 'Yanılgı (?)', val: stats.mistake, color: 'var(--clr-mistake)' },
            { label: 'Gaf (??)', val: stats.blunder, color: 'var(--clr-blunder)' },
          ].map(({ label, val, color }) => (
            <div key={label} className="flex justify-between items-center py-0.5">
              <span className="text-faint">{label}</span>
              <span className="font-bold" style={{ color }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="w-full py-2 rounded border border-base text-xs text-muted hover-surface transition-colors"
      >
        Oyun Listesine Dön
      </button>
    </div>
  );
}
