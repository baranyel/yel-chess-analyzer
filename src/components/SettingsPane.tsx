import { useAnalysis } from '../context/AnalysisContext';
import { usePrefs } from '../context/PrefsContext';
import { BenchmarkPanel } from './BenchmarkPanel';
import { AVAILABLE_ENGINES } from '../lib/engines';
import { effectiveHashMb, logicalCores, workerOptions } from '../lib/engineConfig';
import { SITE_THEMES, BOARD_COLORS, PIECE_SETS, FONT_OPTIONS } from '../lib/themes';

/** Engine, performance, look & feel, and (under Gelişmiş) the benchmark records. */
export function SettingsPane({ benchmarkKey, onBenchmarkChange }: { benchmarkKey: number; onBenchmarkChange: () => void }) {
  const { state, setDepth, setEngine, setWorkerCount, setHashMb } = useAnalysis();
  const { prefs, setTheme, setBoardColor, setPieceSet, setBoardSize, setFont } = usePrefs();
  const { status, depth, engineId, workerCount, hashMb, gameId } = state;
  const isAnalyzing = status === 'analyzing';

  return (
          <div className="p-3 flex flex-col gap-5 overflow-y-auto flex-1 min-h-0">

            {/* Site Teması */}
            <section>
              <label className="block text-sm text-base section-title mb-2">
                Site Teması
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {SITE_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={[
                      'py-2 px-3 rounded text-xs text-left border transition-colors',
                      prefs.theme === t.id
                        ? 'border-accent bg-accent-dim text-accent'
                        : 'border-base text-muted hover-surface',
                    ].join(' ')}
                    style={prefs.theme === t.id ? { borderColor: 'var(--accent)' } : {}}
                  >
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-[10px] text-faint">{t.hint}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Tahta Rengi */}
            <section>
              <label className="block text-sm text-base section-title mb-2">
                Tahta Rengi
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {BOARD_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setBoardColor(c.id)}
                    title={c.name}
                    className={[
                      'flex flex-col items-center gap-1 p-1.5 rounded border transition-colors',
                      prefs.boardColorId === c.id
                        ? 'border-accent'
                        : 'border-base hover-surface',
                    ].join(' ')}
                    style={prefs.boardColorId === c.id ? { borderColor: 'var(--accent)' } : {}}
                  >
                    {/* Mini board swatch: 2x2 squares */}
                    <div className="grid grid-cols-2 rounded overflow-hidden" style={{ width: 28, height: 28 }}>
                      <div style={{ backgroundColor: c.light }} />
                      <div style={{ backgroundColor: c.dark }} />
                      <div style={{ backgroundColor: c.dark }} />
                      <div style={{ backgroundColor: c.light }} />
                    </div>
                    <span className="text-[9px] text-muted leading-tight text-center">{c.name}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Taş Seti */}
            <section>
              <label className="block text-sm text-base section-title mb-2">
                Taş Seti
              </label>
              <div className="flex flex-col gap-1">
                {PIECE_SETS.map((ps) => (
                  <button
                    key={ps.id}
                    onClick={() => setPieceSet(ps.id)}
                    className={[
                      'flex items-center gap-3 px-3 py-2 rounded border text-left transition-colors',
                      prefs.pieceSetId === ps.id
                        ? 'border-accent bg-accent-dim'
                        : 'border-base hover-surface',
                    ].join(' ')}
                    style={prefs.pieceSetId === ps.id ? { borderColor: 'var(--accent)' } : {}}
                  >
                    {ps.path ? (
                      <img
                        src={`${import.meta.env.BASE_URL}${ps.path}/wK.svg`}
                        className="w-7 h-7 shrink-0 object-contain"
                        alt={ps.name}
                        draggable={false}
                      />
                    ) : (
                      <span className="text-xl leading-none w-7 h-7 flex items-center justify-center shrink-0">♔</span>
                    )}
                    <div className="min-w-0">
                      <div className={`text-xs font-semibold ${prefs.pieceSetId === ps.id ? 'text-accent' : 'text-base'}`}>
                        {ps.name}
                      </div>
                      <div className="text-[10px] text-faint">{ps.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Tahta Boyutu */}
            <section>
              <label className="block text-sm text-base section-title mb-2">
                Tahta Boyutu — {Math.round(520 * prefs.boardSize / 100)}px
              </label>
              <input
                type="range"
                min={70}
                max={130}
                step={5}
                value={prefs.boardSize}
                onChange={(e) => setBoardSize(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-faint mt-1">
                <span>Küçük</span>
                <span className="text-muted">{prefs.boardSize}%</span>
                <span>Büyük</span>
              </div>
            </section>

            {/* Font Seçimi */}
            <section>
              <label className="block text-sm text-base section-title mb-2">
                Yazı Tipi
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFont(f.id)}
                    className={[
                      'py-2 px-3 rounded border text-left transition-colors',
                      prefs.fontId === f.id
                        ? 'border-accent bg-accent-dim'
                        : 'border-base hover-surface',
                    ].join(' ')}
                    style={prefs.fontId === f.id ? { borderColor: 'var(--accent)' } : {}}
                  >
                    <div
                      className={`text-xs font-semibold ${prefs.fontId === f.id ? 'text-accent' : 'text-base'}`}
                      style={{ fontFamily: f.stack }}
                    >
                      {f.name}
                    </div>
                    <div className="text-[10px] text-faint" style={{ fontFamily: f.stack }}>
                      Abc 123
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Ayırıcı */}
            <div className="border-t border-base" />

            {/* Motor */}
            <section>
              <label className="block text-sm text-base section-title mb-2">
                Motor (Engine)
              </label>
              <div className="flex flex-col gap-1.5">
                {AVAILABLE_ENGINES.map((eng) => (
                  <button
                    key={eng.id}
                    onClick={() => setEngine(eng.id)}
                    disabled={isAnalyzing}
                    className={[
                      'w-full text-left px-3 py-2 rounded border text-xs transition-colors',
                      engineId === eng.id
                        ? 'border-accent bg-accent-dim'
                        : 'border-base hover-surface',
                      isAnalyzing ? 'opacity-40 cursor-not-allowed' : '',
                    ].join(' ')}
                    style={engineId === eng.id ? { borderColor: 'var(--accent)' } : {}}
                  >
                    <div className={`font-semibold ${engineId === eng.id ? 'text-accent' : 'text-base'}`}>{eng.name}</div>
                    <div className="text-[10px] text-faint mt-0.5">{eng.description}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Derinlik */}
            <section>
              <label className="block text-sm text-base section-title mb-2">
                Analiz Derinliği — {depth}
              </label>
              <input
                type="range"
                min={8}
                max={24}
                step={1}
                value={depth}
                disabled={isAnalyzing}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="w-full disabled:opacity-40"
              />
              <div className="flex justify-between text-[10px] text-faint mt-1">
                <span>8 (hızlı)</span>
                <span>24 (derin)</span>
              </div>
            </section>

            {/* Performans */}
            <section>
              <label className="block text-sm text-base section-title mb-2">
                Performans
              </label>

              <div className="space-y-3">
                {/* Worker sayısı */}
                <div>
                  <div className="text-[10px] text-muted mb-1.5">
                    Paralel İşçi Sayısı
                    <span className="text-faint ml-1">— bu cihazda {logicalCores()} mantıksal çekirdek var</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {workerOptions(workerCount).map((n) => (
                      <button
                        key={n}
                        onClick={() => setWorkerCount(n)}
                        disabled={isAnalyzing}
                        className={[
                          'py-1.5 rounded border text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                          workerCount === n
                            ? 'border-accent bg-accent-dim text-accent'
                            : 'border-base text-muted hover-surface',
                        ].join(' ')}
                        style={workerCount === n ? { borderColor: 'var(--accent)' } : {}}
                      >
                        ×{n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hash belleği */}
                <div>
                  <div className="text-[10px] text-muted mb-1.5">
                    Hash Belleği
                    <span className="text-faint ml-1">— transposition table boyutu</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {([32, 64, 128, 256, 512, 1024] as const).map((mb) => (
                      <button
                        key={mb}
                        onClick={() => setHashMb(mb)}
                        disabled={isAnalyzing}
                        className={[
                          'py-1.5 rounded border text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                          hashMb === mb
                            ? 'border-accent bg-accent-dim text-accent'
                            : 'border-base text-muted hover-surface',
                        ].join(' ')}
                        style={hashMb === mb ? { borderColor: 'var(--accent)' } : {}}
                      >
                        {mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Efektif hash bilgisi */}
                {(() => {
                  const effective = effectiveHashMb(workerCount, hashMb);
                  return effective < hashMb ? (
                    <p className="text-[10px] text-faint">
                      Toplam hash bütçesi nedeniyle işçi başına etkin hash:{' '}
                      <span className="text-muted font-semibold">{effective}MB</span>
                    </p>
                  ) : null;
                })()}

                {/* Uyarı */}
                {(workerCount >= logicalCores() || workerCount >= 8 || hashMb >= 512) && (
                  <div className="flex items-start gap-2 px-2.5 py-2 rounded border text-[10px]"
                    style={{ borderColor: 'var(--warning, #f59e0b)', backgroundColor: 'color-mix(in srgb, var(--warning, #f59e0b) 10%, transparent)' }}
                  >
                    <span style={{ color: 'var(--warning, #f59e0b)' }} className="shrink-0 mt-px">⚠</span>
                    <span className="text-muted">
                      Bu seçenek sisteminizi zorlayabilir! Yavaş cihazlarda sekme donabilir veya tarayıcı bellek hatası verebilir.
                    </span>
                  </div>
                )}
              </div>
            </section>

            <details className="border-t border-base pt-3">
              <summary className="cursor-pointer text-sm text-base select-none" style={{ fontFamily: 'var(--font-pixel)' }}>
                Gelişmiş: benchmark kayıtları
              </summary>
              <div className="mt-2">
                <BenchmarkPanel key={benchmarkKey} gameId={gameId} onRunsChange={onBenchmarkChange} />
              </div>
            </details>

            <p className="text-[10px] text-faint leading-relaxed border-t border-base pt-3">
              Motor: Stockfish (GPL-3.0). Taş setleri ve yazı tipleri üçüncü taraf lisanslarıyla gelir —{' '}
              <a
                href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}
                target="_blank"
                rel="noreferrer"
                className="underline hover-text-accent"
              >
                lisanslar
              </a>
              .
            </p>
          </div>
  );
}
