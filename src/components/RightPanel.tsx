import { useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import { usePrefs } from '../context/PrefsContext';
import { MoveList } from './MoveList';
import { GameSummary } from './GameSummary';
import { AVAILABLE_ENGINES } from '../lib/engines';
import { SITE_THEMES, BOARD_COLORS, PIECE_SETS, FONT_OPTIONS } from '../lib/themes';

const EXAMPLE_PGN = `[Event "F/S Return Match"]
[White "Fischer, Robert J."]
[Black "Spassky, Boris V."]
[Result "1-0"]
[WhiteElo "2785"]
[BlackElo "2660"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6
8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7
14. Bg5 b4 15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6
20. Nbd2 Nxd6 21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7
25. Nxf7 Rxe1+ 26. Qxe1 Kxf7 27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6
30. a3 Kd6 31. axb4 cxb4 32. Ra5 Nd5 33. f3 Bc8 34. Kf2 Bf5 35. Ra7 g6
36. Ra6+ Kc5 37. Ke1 Nf4 38. g3 Nxh3 39. Kd2 Kb5 40. Rd6 Kc5 41. Ra6 Nf2
42. g4 Bd3 43. Re6 1-0`;

type Tab = 'giris' | 'hamleler' | 'ayarlar' | 'ozet';

export function RightPanel() {
  const { state, loadGame, startAnalysis, navigate, setDepth, setEngine } = useAnalysis();
  const { prefs, setTheme, setBoardColor, setPieceSet, setBoardSize, setFont } = usePrefs();
  const { status, moves, sanMoves, currentIndex, totalMoves, analyzedCount, summary, metadata, depth, engineId } = state;

  const [pgnText, setPgnText] = useState('');
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('giris');

  const isDone = status === 'done';
  const isAnalyzing = status === 'analyzing';
  const hasGame = status === 'ready' || status === 'analyzing' || status === 'done';

  const handleLoad = () => {
    const v = pgnText.trim();
    if (!v) { setPgnError('Lütfen bir PGN veya FEN yapıştırın.'); return; }
    setPgnError(null);
    try {
      loadGame(v);
      setTab('hamleler');
    } catch (e) {
      setPgnError((e as Error).message);
    }
  };

  const handleStartAnalysis = () => {
    startAnalysis();
    setTab('hamleler');
  };

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'giris',    label: 'Giriş' },
    { id: 'hamleler', label: 'Hamleler', disabled: !hasGame },
    { id: 'ayarlar',  label: 'Ayarlar' },
    { id: 'ozet',     label: 'Özet', disabled: !isDone },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <div className="flex border-b border-base shrink-0 bg-surface">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setTab(t.id)}
            disabled={t.disabled}
            className={[
              'flex-1 py-2.5 text-xs font-semibold transition-colors',
              t.disabled
                ? 'text-faint cursor-not-allowed'
                : tab === t.id
                ? 'text-accent border-b-2 border-accent -mb-px'
                : 'text-muted hover-surface',
            ].join(' ')}
            style={tab === t.id ? { borderBottomColor: 'var(--accent)' } : {}}
          >
            {t.label}
            {t.id === 'hamleler' && isAnalyzing && (
              <span className="ml-1 text-accent text-[9px]">
                {analyzedCount}/{totalMoves}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* ── Giriş ────────────────────────────────────────────────── */}
        {tab === 'giris' && (
          <div className="flex flex-col gap-3 p-3 overflow-y-auto flex-1">
            <p className="text-xs text-muted">PGN veya FEN yapıştırın, ardından yükleyin.</p>

            <textarea
              value={pgnText}
              onChange={(e) => { setPgnText(e.target.value); setPgnError(null); }}
              rows={10}
              placeholder="1. e4 e5 2. Nf3…  veya  FEN dizesi"
              className="w-full bg-surface-2 border border-base rounded px-3 py-2 text-xs text-base font-mono resize-y transition-colors"
              spellCheck={false}
            />

            {pgnError && <p className="text-xs text-danger">{pgnError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleLoad}
                className="flex-1 py-2 rounded text-xs font-semibold text-white transition-colors"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                Yükle
              </button>
              <button
                onClick={() => { setPgnText(EXAMPLE_PGN); setPgnError(null); }}
                className="px-3 py-2 text-xs text-muted border border-base rounded hover-surface transition-colors"
              >
                Örnek
              </button>
            </div>

            {hasGame && metadata && (
              <div className="p-2.5 bg-surface-2 border border-base rounded text-xs space-y-1">
                <div className="font-semibold text-base">
                  {metadata.white} — {metadata.black}
                </div>
                <div className="text-muted">{metadata.event} · {metadata.date}</div>
                <div className="text-faint">{totalMoves} hamle yüklendi</div>
              </div>
            )}
          </div>
        )}

        {/* ── Hamleler ─────────────────────────────────────────────── */}
        {tab === 'hamleler' && hasGame && (
          <div className="flex-1 overflow-hidden">
            <MoveList
              moves={moves}
              sanMoves={sanMoves}
              currentIndex={currentIndex}
              totalMoves={totalMoves}
              analyzedCount={analyzedCount}
              onSelect={navigate}
            />
          </div>
        )}

        {tab === 'hamleler' && !hasGame && (
          <div className="flex items-center justify-center flex-1 text-faint text-xs">
            Önce bir oyun yükleyin.
          </div>
        )}

        {/* ── Ayarlar ──────────────────────────────────────────────── */}
        {tab === 'ayarlar' && (
          <div className="p-3 flex flex-col gap-5 overflow-y-auto flex-1">

            {/* Site Teması */}
            <section>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
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
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
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
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
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
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
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
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
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
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
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
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
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
          </div>
        )}

        {/* ── Özet ──────────────────────────────────────────────────── */}
        {tab === 'ozet' && isDone && summary && metadata && (
          <div className="p-3 overflow-y-auto flex-1">
            <GameSummary summary={summary} metadata={metadata} />
          </div>
        )}

        {tab === 'ozet' && !isDone && (
          <div className="flex items-center justify-center flex-1 text-faint text-xs">
            Analiz tamamlandığında burada özet görünür.
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      {(status === 'ready' || status === 'done') && (
        <div className="shrink-0 border-t border-base p-3">
          <button
            onClick={handleStartAnalysis}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            {status === 'done' ? 'Yeniden Analiz Et' : 'Analizi Başlat'}
          </button>
        </div>
      )}

      {isAnalyzing && (
        <div className="shrink-0 border-t border-base p-3 space-y-1.5">
          <div className="text-xs text-accent text-center animate-pulse">
            Analiz ediliyor… {analyzedCount}/{totalMoves} hamle
          </div>
          <div className="h-1 bg-surface-2 rounded overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${totalMoves > 0 ? (analyzedCount / totalMoves) * 100 : 0}%`,
                backgroundColor: 'var(--accent)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
