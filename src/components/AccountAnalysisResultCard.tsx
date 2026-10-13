import type { AccountAnalysisResult } from '../lib/accountAnalysis';
import type { PlayerPhaseBreakdown, PhasePlayerStats } from '../lib/phases';
import { accuracyBg, eloColor } from '../lib/ui';

interface Props {
  result: AccountAnalysisResult;
  onClose: () => void;
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
            style={{ backgroundColor: accuracyBg(stats.accuracy), color: '#fff' }}
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
  const { stats, phaseBreakdown, gamesAnalyzed, skipped, username } = result;
  const eloClr = eloColor(stats.estimatedElo);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Header */}
      <div>
        <h3 className="text-xs font-bold text-base truncate">{username}</h3>
        <p className="text-[10px] text-faint">{gamesAnalyzed} maç analiz edildi</p>
        {skipped > 0 && (
          <p className="text-[10px] text-faint">
            {skipped} maç atlandı (desteklenmeyen varyant, okunamayan PGN veya oyuncu bulunamadı)
          </p>
        )}
        {gamesAnalyzed === 0 && (
          <p className="text-[10px] text-danger mt-1">Analiz edilebilen maç yok; rating hesaplanamadı.</p>
        )}
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
              style={{ backgroundColor: accuracyBg(stats.accuracy), color: '#fff' }}
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
        <p className="section-title text-base mb-2">
          Fazlara göre rating
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
        <p className="section-title text-base mb-2">
          Hamle dağılımı
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
        Oyun listesine dön
      </button>
    </div>
  );
}
