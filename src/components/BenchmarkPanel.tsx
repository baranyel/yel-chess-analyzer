import { useState, useEffect, useCallback } from 'react';
import {
  loadRunsForGame,
  deleteRun,
  deleteAllRunsForGame,
  computeConsistency,
  groupRunsByConfig,
  type BenchmarkRun,
  type ConsistencyReport,
} from '../lib/benchmark';

interface Props {
  gameId: string | null;
  onRunsChange?: () => void;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'var(--success, #4caf50)' : score >= 55 ? 'var(--warning, #ff9800)' : 'var(--danger, #f44336)';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-2 rounded overflow-hidden">
        <div className="h-full rounded transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-8 text-right" style={{ color }}>{score}</span>
    </div>
  );
}

function RunRow({ run, onDelete }: { run: BenchmarkRun; onDelete: () => void }) {
  const date = new Date(run.timestamp);
  const dateStr = date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
  const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-2 text-[10px]">
      <div className="text-faint whitespace-nowrap shrink-0">{dateStr} {timeStr}</div>
      <div className="flex-1 flex gap-3 justify-center">
        <span className="text-muted">
          B <span className="text-base font-semibold">{run.summary.white.accuracy}%</span>
          <span className="text-faint ml-1">{run.summary.white.acpl}acpl</span>
        </span>
        <span className="text-faint">·</span>
        <span className="text-muted">
          S <span className="text-base font-semibold">{run.summary.black.accuracy}%</span>
          <span className="text-faint ml-1">{run.summary.black.acpl}acpl</span>
        </span>
      </div>
      <button
        onClick={onDelete}
        className="shrink-0 text-faint hover:text-danger transition-colors px-1"
        title="Kaydı sil"
      >
        ✕
      </button>
    </div>
  );
}

function ConfigGroup({
  runs,
  report,
  onDeleteRun,
}: {
  runs: BenchmarkRun[];
  report: ConsistencyReport | null;
  onDeleteRun: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const sample = runs[0];

  return (
    <div className="border border-base rounded overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-surface hover-surface text-left"
      >
        <span className="flex-1 text-xs font-semibold text-base">
          {sample.engineName}
          <span className="text-faint font-normal ml-1">· Derin {sample.depth}</span>
        </span>
        <span className="text-[10px] text-muted">{runs.length} kayıt</span>
        <span className="text-faint text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="p-2.5 space-y-2.5 bg-surface border-t border-base">
          {/* Consistency metrics */}
          {report ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Tutarlılık Skoru</span>
              </div>
              <ScoreBar score={report.consistencyScore} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted mt-1.5">
                <div>
                  Sınıf uyumu
                  <span className="text-base font-semibold ml-1">{report.classificationAgreementPct}%</span>
                </div>
                <div>
                  Eval sapması
                  <span className="text-base font-semibold ml-1">±{report.avgEvalStdDevCp}cp</span>
                </div>
                <div>
                  ACPL sapması (B)
                  <span className="text-base font-semibold ml-1">±{report.acplStdDev.white}</span>
                </div>
                <div>
                  ACPL sapması (S)
                  <span className="text-base font-semibold ml-1">±{report.acplStdDev.black}</span>
                </div>
                <div>
                  İsabet sapması (B)
                  <span className="text-base font-semibold ml-1">±{report.accuracyStdDev.white}%</span>
                </div>
                <div>
                  İsabet sapması (S)
                  <span className="text-base font-semibold ml-1">±{report.accuracyStdDev.black}%</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-faint italic">
              Tutarlılık hesabı için en az 2 kayıt gerekli.
            </p>
          )}

          {/* Individual runs */}
          <div className="space-y-1 mt-1">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                onDelete={() => onDeleteRun(run.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function BenchmarkPanel({ gameId, onRunsChange }: Props) {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);

  const reload = useCallback(() => {
    setRuns(gameId ? loadRunsForGame(gameId) : []);
  }, [gameId]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = (id: string) => {
    deleteRun(id);
    reload();
    onRunsChange?.();
  };

  const handleDeleteAll = () => {
    if (!gameId) return;
    deleteAllRunsForGame(gameId);
    reload();
    onRunsChange?.();
  };

  if (!gameId) {
    return (
      <div className="flex items-center justify-center flex-1 text-faint text-xs p-4 text-center">
        Benchmark verisi görmek için önce bir oyun yükleyin.
      </div>
    );
  }

  const grouped = groupRunsByConfig(runs);

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto flex-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Analiz Geçmişi
        </span>
        {runs.length > 0 && (
          <button
            onClick={handleDeleteAll}
            className="text-[10px] text-danger hover:underline transition-colors"
          >
            Tümünü Sil
          </button>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="text-center text-faint text-xs py-8 space-y-1">
          <p>Bu oyun için henüz kayıt yok.</p>
          <p>Analiz bitince <span className="text-muted font-semibold">Kaydet</span> butonuna basın.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from(grouped.entries()).map(([key, groupRuns]) => {
            const report = computeConsistency(groupRuns);
            return (
              <ConfigGroup
                key={key}
                runs={groupRuns}
                report={report}
                onDeleteRun={handleDelete}
              />
            );
          })}
        </div>
      )}

      {/* Legend */}
      {runs.length > 0 && (
        <div className="text-[10px] text-faint space-y-0.5 mt-1">
          <p>B = Beyaz, S = Siyah</p>
          <p>Tutarlılık skoru: sınıf uyumu (%60) + eval stabilitesi (%40)</p>
        </div>
      )}
    </div>
  );
}
