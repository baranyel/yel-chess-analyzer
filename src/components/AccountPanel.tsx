import { useState, useEffect, useRef } from 'react';
import {
  fetchLichessGames,
  fetchChessComGames,
  loadSavedUsernames,
  saveUsername,
  type Platform,
  type GameSummary,
} from '../lib/accounts';
import {
  hasAnalysisRecord,
  loadAnalysisRecord,
  computeGameId,
  type AnalysisRecord,
} from '../lib/analysisHistory';

interface Props {
  onGameLoad: (pgn: string) => void;
  onRestoreAnalysis: (record: AnalysisRecord) => void;
}

function ResultBadge({ result }: { result: string }) {
  const color =
    result === '1-0' ? 'var(--success, #4caf50)'
    : result === '0-1' ? 'var(--danger, #f44336)'
    : 'var(--text-muted, #888)';
  return (
    <span className="text-[10px] font-bold shrink-0 w-8 text-center" style={{ color }}>
      {result}
    </span>
  );
}

function GameRow({ game, onLoad, analyzed }: { game: GameSummary; onLoad: () => void; analyzed: boolean }) {
  return (
    <button
      onClick={onLoad}
      className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded hover-surface transition-colors border border-transparent hover:border-base"
    >
      <ResultBadge result={game.result} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-base truncate">
          <span className="font-semibold">{game.white}</span>
          {game.whiteElo && <span className="text-faint ml-1">({game.whiteElo})</span>}
          <span className="text-faint mx-1">–</span>
          <span className="font-semibold">{game.black}</span>
          {game.blackElo && <span className="text-faint ml-1">({game.blackElo})</span>}
        </div>
        <div className="text-[10px] text-faint mt-0.5 flex gap-2">
          <span>{game.date}</span>
          {game.timeControl && <span>· {game.timeControl}</span>}
          {analyzed && (
            <span className="font-semibold" style={{ color: 'var(--success, #4caf50)' }}>✓ Analiz edildi</span>
          )}
        </div>
      </div>
      <span className="text-faint text-[10px] shrink-0">›</span>
    </button>
  );
}

export function AccountPanel({ onGameLoad, onRestoreAnalysis }: Props) {
  const saved = loadSavedUsernames();
  const [platform, setPlatform] = useState<Platform>('lichess');
  const [username, setUsername] = useState(saved[platform] ?? '');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore saved username when platform changes
  useEffect(() => {
    const names = loadSavedUsernames();
    setUsername(names[platform] ?? '');
    setGames([]);
    setError(null);
  }, [platform]);

  const handleFetch = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    saveUsername(platform, trimmed);
    setLoading(true);
    setError(null);
    setGames([]);
    try {
      const result = platform === 'lichess'
        ? await fetchLichessGames(trimmed)
        : await fetchChessComGames(trimmed);
      if (result.length === 0) {
        setError('Maç bulunamadı.');
      } else {
        setGames(result);
      }
    } catch (e) {
      setError((e as Error).message ?? 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFetch();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Platform seçici */}
      <div className="shrink-0 flex gap-1.5 p-3 pb-2">
        {(['lichess', 'chesscom'] as Platform[]).map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={[
              'flex-1 py-2 rounded border text-xs font-semibold transition-colors',
              platform === p
                ? 'border-accent bg-accent-dim text-accent'
                : 'border-base text-muted hover-surface',
            ].join(' ')}
            style={platform === p ? { borderColor: 'var(--accent)' } : {}}
          >
            {p === 'lichess' ? 'Lichess' : 'Chess.com'}
          </button>
        ))}
      </div>

      {/* Username input */}
      <div className="shrink-0 flex gap-2 px-3 pb-3">
        <input
          ref={inputRef}
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Kullanıcı adı"
          className="flex-1 bg-surface-2 border border-base rounded px-2.5 py-1.5 text-xs text-base focus:outline-none focus:border-accent transition-colors"
          style={{ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
          disabled={loading}
        />
        <button
          onClick={handleFetch}
          disabled={loading || !username.trim()}
          className="px-3 py-1.5 rounded text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
        >
          {loading ? '...' : 'Getir'}
        </button>
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading && (
          <div className="flex items-center justify-center py-10 text-xs text-muted animate-pulse">
            Maçlar yükleniyor…
          </div>
        )}

        {error && !loading && (
          <p className="text-xs text-danger text-center py-6">{error}</p>
        )}

        {!loading && !error && games.length === 0 && (
          <div className="text-center py-10 text-faint text-xs space-y-1">
            <p>Kullanıcı adını girin ve</p>
            <p><span className="text-muted font-semibold">Getir</span> butonuna basın.</p>
          </div>
        )}

        {!loading && games.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-faint mb-2">
              {games.length} maç bulundu — analiz için tıklayın
            </p>
            {games.map((game) => {
              const gameId = computeGameId(game.pgn.trim());
              const analyzed = hasAnalysisRecord(gameId);
              return (
                <GameRow
                  key={game.id}
                  game={game}
                  analyzed={analyzed}
                  onLoad={() => {
                    if (analyzed) {
                      const record = loadAnalysisRecord(gameId);
                      if (record) { onRestoreAnalysis(record); return; }
                    }
                    onGameLoad(game.pgn);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
