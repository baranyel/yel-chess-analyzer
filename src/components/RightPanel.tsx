import { useEffect, useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import { MoveList } from './MoveList';
import { EvalGraph } from './EvalGraph';
import { GameSummary } from './GameSummary';
import { AccountPanel } from './AccountPanel';
import { PhaseBreakdown } from './PhaseBreakdown';
import { SettingsPane } from './SettingsPane';

type Tab = 'hamleler' | 'ozet' | 'hesap' | 'ayarlar';

export function RightPanel() {
  const { state, loadGame, startAnalysis, stopAnalysis, navigate, saveCurrentAnalysis, restoreAnalysis } = useAnalysis();
  const { status, moves, sanMoves, currentIndex, totalMoves, analyzedCount, summary, metadata, gameId, analysisError, storageWarning, engineStage } = state;

  // With no game the useful thing next to the "new analysis" window is the account list;
  // as soon as a game is loaded the move list takes over.
  const [tab, setTab] = useState<Tab>('hesap');
  useEffect(() => { setTab(gameId ? 'hamleler' : 'hesap'); }, [gameId]);

  const [savedFeedback, setSavedFeedback] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [benchmarkKey, setBenchmarkKey] = useState(0);
  const [accountBusy, setAccountBusy] = useState(false);

  const isDone = status === 'done';
  const isAnalyzing = status === 'analyzing';
  const hasGame = status === 'ready' || status === 'analyzing' || status === 'done';

  const handleSave = () => {
    const run = saveCurrentAnalysis();
    if (!run) { setSaveFailed(true); return; }
    setSaveFailed(false);
    setSavedFeedback(true);
    setBenchmarkKey((k) => k + 1);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'hamleler', label: 'Hamleler', disabled: !hasGame },
    { id: 'ozet',     label: 'Özet',     disabled: !isDone || !summary },
    { id: 'hesap',    label: 'Hesap' },
    { id: 'ayarlar',  label: 'Ayarlar' },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Analiz bölümleri" className="flex gap-1 px-2 pt-2 shrink-0 bg-surface border-b border-strong">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => !t.disabled && setTab(t.id)}
              disabled={t.disabled}
              className={[
                'px-3.5 py-1.5 text-[13px] rounded-t border border-b-0 transition-colors',
                active ? 'bg-base text-base font-bold border-strong -mb-px pb-2' : 'border-base text-muted hover-surface',
                t.disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {t.label}
              {t.id === 'hamleler' && isAnalyzing && (
                <span className="ml-1.5 text-accent text-[11px] font-normal">{analyzedCount}/{totalMoves}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">

        {/* Always mounted (just hidden): switching tabs must not drop the game list
            or the progress of a running account analysis. */}
        <div className={tab === 'hesap' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
          <AccountPanel
            onGameLoad={(pgn) => loadGame(pgn)}
            onRestoreAnalysis={(record) => restoreAnalysis(record)}
            onBusyChange={setAccountBusy}
          />
        </div>

        {tab === 'hamleler' && hasGame && totalMoves === 0 && (
          <div className="flex items-center justify-center flex-1 text-faint text-sm text-center px-6 leading-relaxed">
            Bu bir FEN pozisyonu, hamle listesi yok.
            <br />
            «Pozisyonu analiz et» ile motoru çalıştırın; sonuç tahtanın altında görünür.
          </div>
        )}

        {tab === 'hamleler' && hasGame && totalMoves > 0 && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <EvalGraph moves={moves} currentIndex={currentIndex} onSelect={navigate} />
            <div className="flex-1 min-h-0">
            <MoveList
              moves={moves}
              sanMoves={sanMoves}
              currentIndex={currentIndex}
              totalMoves={totalMoves}
              analyzedCount={analyzedCount}
              onSelect={navigate}
            />
            </div>
          </div>
        )}

        {tab === 'ozet' && isDone && summary && metadata && (
          <div className="p-3 overflow-y-auto flex-1">
            <GameSummary summary={summary} metadata={metadata} />
            <PhaseBreakdown moves={moves} metadata={metadata} />
          </div>
        )}

        {tab === 'ayarlar' && (
          <SettingsPane benchmarkKey={benchmarkKey} onBenchmarkChange={() => setBenchmarkKey((k) => k + 1)} />
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      {(status === 'ready' || status === 'done') && (
        <div className="shrink-0 border-t border-strong bg-surface p-3 space-y-2">
          {analysisError && (
            <div
              role="alert"
              className="px-2.5 py-2 rounded border text-xs leading-relaxed"
              style={{
                borderColor: 'var(--danger)',
                color: 'var(--danger)',
                backgroundColor: 'color-mix(in srgb, var(--danger) 10%, transparent)',
              }}
            >
              <span className="font-bold">Analiz başarısız: </span>{analysisError}
            </div>
          )}
          <button
            onClick={() => startAnalysis()}
            disabled={accountBusy}
            title={accountBusy ? 'Hesap analizi sürerken başlatılamaz.' : undefined}
            className="btn-primary w-full py-2 text-sm"
          >
            {analysisError
              ? 'Tekrar dene'
              : status === 'done'
                ? 'Yeniden analiz et'
                : totalMoves === 0
                  ? 'Pozisyonu analiz et'
                  : 'Analizi başlat'}
          </button>
          {accountBusy && (
            <p className="text-xs text-faint text-center">
              Hesap analizi sürüyor; bitince veya iptal edince başlatabilirsiniz.
            </p>
          )}
          {isDone && summary && (
            <button
              onClick={handleSave}
              disabled={savedFeedback}
              className="btn-raised w-full py-1.5 text-[13px]"
            >
              {savedFeedback ? 'Kaydedildi' : 'Benchmark\'a kaydet'}
            </button>
          )}
          {saveFailed && (
            <p role="alert" className="text-xs text-danger text-center">
              Kaydedilemedi: tarayıcı depolaması dolu. Ayarlar'daki eski benchmark kayıtlarını silin.
            </p>
          )}
          {storageWarning && (
            <p role="alert" className="text-xs text-danger text-center">{storageWarning}</p>
          )}
        </div>
      )}

      {isAnalyzing && (
        <div className="shrink-0 border-t border-strong bg-surface p-3 space-y-2">
          {engineStage === 'loading-engine' ? (
            <div className="text-sm text-accent text-center animate-pulse">
              Motor yükleniyor… <span className="text-faint">(ilk açılışta büyük dosya indirilir)</span>
            </div>
          ) : (
            <div className="text-sm text-accent text-center animate-pulse">
              {totalMoves > 0
                ? `Analiz ediliyor… ${analyzedCount}/${totalMoves} hamle`
                : 'Pozisyon analiz ediliyor…'}
            </div>
          )}
          <div className="h-2 bg-surface-2 border border-base rounded-sm overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${totalMoves > 0 ? (analyzedCount / totalMoves) * 100 : 0}%`,
                background: 'repeating-linear-gradient(90deg, var(--accent) 0 8px, transparent 8px 10px)',
              }}
            />
          </div>
          <button onClick={stopAnalysis} className="btn-raised w-full py-1.5 text-[13px]">
            Durdur
          </button>
        </div>
      )}
    </div>
  );
}
