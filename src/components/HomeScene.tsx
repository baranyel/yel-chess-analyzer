import { useMemo, useRef, useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import { Sticker } from './Sticker';
import { Window } from './Window';
import { EXAMPLE_PGN } from '../lib/examples';
import { loadAnalysisRecord, loadHistoryIndex } from '../lib/analysisHistory';
import { splitPgnGames } from '../lib/pgn';

const MAX_PGN_FILE_BYTES = 5_000_000;
const RECENT_LIMIT = 6;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

/** What you see before a game is loaded: paste / drop a game and analyse it straight away. */
export function HomeScene({ className = '' }: { className?: string }) {
  const { loadAndAnalyze, restoreAnalysis } = useAnalysis();

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recent = useMemo(() => [...loadHistoryIndex().values()].slice(0, RECENT_LIMIT), []);

  // A .pgn file can hold many games; the first one is loaded.
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_PGN_FILE_BYTES) {
      setError('Dosya çok büyük (en fazla 5 MB).');
      return;
    }
    try {
      const games = splitPgnGames(await file.text());
      setText(games[0] ?? '');
      setError(null);
      setNote(games.length > 1 ? `Dosyada ${games.length} oyun var; ilki yüklendi.` : null);
    } catch {
      setError('Dosya okunamadı.');
    }
  };

  const submit = () => {
    if (!text.trim()) { setError('Önce bir PGN veya FEN yapıştırın ya da dosya bırakın.'); return; }
    setError(loadAndAnalyze(text));
  };

  const openRecent = (gameId: string) => {
    const record = loadAnalysisRecord(gameId);
    if (record) restoreAnalysis(record);
    else setError('Bu kayıt artık bulunamıyor.');
  };

  return (
    <div className={`relative flex flex-col ${className}`}>
      {/* The stickers are siblings of the window (not children) so they can hang over its edge. */}
      <div
        aria-hidden="true"
        className="absolute z-10 pointer-events-none origin-top-right scale-[.5] sm:scale-[.7] xl:scale-100 right-2 -top-4 xl:right-7 xl:-top-6"
      >
        <Sticker piece="bK" size={240} rotate={-8} className="slap" />
      </div>
      <div
        aria-hidden="true"
        className="absolute z-10 pointer-events-none origin-top-right max-sm:hidden sm:scale-[.7] xl:scale-100 sm:right-24 sm:top-24 xl:right-[13.5rem] xl:top-24"
      >
        <Sticker piece="bN" size={150} rotate={10} ring className="slap" style={{ "--slap-delay": ".14s" } as React.CSSProperties} />
      </div>

      <Window title="Yeni analiz" className="flex-1" bodyClassName="overflow-y-auto">
      <div className="p-5 max-sm:p-4 flex flex-col gap-5 flex-1">
        <div className="min-h-[8.5rem] xl:min-h-[15rem] pr-24 sm:pr-40 xl:pr-[26rem]">
          <div className="min-w-0 pt-1">
            <h1
              className="m-0 text-[2rem] max-sm:text-[1.6rem] leading-tight text-base"
              style={{ fontFamily: 'var(--font-pixel)', fontWeight: 500 }}
            >
              Maçını analiz et
            </h1>
            <p className="mt-2 mb-0 text-sm text-muted max-w-[34ch] leading-relaxed">
              Stockfish bu sayfanın içinde çalışır. Oyunların tarayıcından dışarı çıkmaz.
            </p>
          </div>

        </div>

        <div
          className="flex flex-col gap-2 flex-1 min-h-[12rem]"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files[0]); }}
        >
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); setNote(null); }}
            rows={6}
            aria-label="PGN veya FEN"
            placeholder="PGN veya FEN yapıştırın, ya da .pgn dosyasını buraya bırakın"
            className="w-full flex-1 min-h-[9rem] bg-surface-2 text-base text-xs font-mono resize-none p-3 border-2 rounded-sm"
            style={{
              borderStyle: 'dashed',
              borderColor: dragging ? 'var(--hot)' : 'var(--border-strong)',
              background: dragging ? 'color-mix(in srgb, var(--hot) 8%, var(--surface-2))' : undefined,
            }}
            spellCheck={false}
          />
          {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
          {note && !error && <p className="m-0 text-sm text-muted">{note}</p>}

          <div className="flex flex-wrap gap-2">
            <button onClick={submit} className="btn-primary px-5 py-2 text-sm">Yükle ve analiz et</button>
            <button onClick={() => fileInputRef.current?.click()} className="btn-raised px-4 py-2 text-sm">Dosya seç…</button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pgn,.txt,text/plain"
              className="hidden"
              onChange={(e) => {
                readFile(e.target.files?.[0]);
                e.target.value = ''; // allow picking the same file again
              }}
            />
            <button
              onClick={() => { setText(EXAMPLE_PGN); setError(null); setNote(null); }}
              className="btn-raised px-4 py-2 text-sm"
            >
              Örnek oyun
            </button>
          </div>
          <p className="m-0 text-xs text-faint">
            Lichess veya Chess.com maçlarını çekmek için Hesap sekmesini kullanın.
          </p>
        </div>

        {recent.length > 0 && (
          <section aria-label="Son analizler">
            <h2 className="section-title m-0 mb-2 text-base">Son analizler</h2>
            <ul className="m-0 p-0 list-none border border-base rounded-sm bg-surface-2 divide-y divide-[var(--border)]">
              {recent.map((e) => (
                <li key={e.gameId}>
                  <button
                    onClick={() => openRecent(e.gameId)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover-surface"
                  >
                    <span className="flex-1 min-w-0 truncate text-base">
                      {e.white && e.black ? `${e.white} — ${e.black}` : `Oyun ${e.gameId}`}
                    </span>
                    {e.result && <span className="text-muted tabular-nums">{e.result}</span>}
                    <span className="text-faint text-xs tabular-nums">derinlik {e.depth}</span>
                    <span className="text-faint text-xs tabular-nums">{formatDate(e.analyzedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      </Window>
    </div>
  );
}
