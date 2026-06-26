import { useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { useAnalysis } from './context/AnalysisContext';
import { usePrefs } from './context/PrefsContext';
import { EvalBar } from './components/EvalBar';
import { MoveDetail } from './components/MoveDetail';
import { NavigationControls } from './components/NavigationControls';
import { RightPanel } from './components/RightPanel';
import { BOARD_COLORS, PIECE_SETS } from './lib/themes';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BASE_BOARD_SIZE = 520;

type PieceKey = 'wP' | 'wN' | 'wB' | 'wR' | 'wQ' | 'wK' | 'bP' | 'bN' | 'bB' | 'bR' | 'bQ' | 'bK';

function buildPieceImages(path: string | null) {
  if (!path) return undefined;
  const keys: PieceKey[] = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
  return Object.fromEntries(
    keys.map((p) => [
      p,
      ({ squareWidth }: { squareWidth: number }) => (
        <img
          src={`${path}/${p}.svg`}
          style={{ width: squareWidth, height: squareWidth }}
          alt={p}
          draggable={false}
        />
      ),
    ]),
  );
}

export default function App() {
  const { state, navigate, reset } = useAnalysis();
  const { prefs } = usePrefs();
  const { status, fens, moves, currentIndex, metadata } = state;

  const hasGame = status !== 'idle' && status !== 'error';
  const currentFen = hasGame && fens.length > 0 ? (fens[currentIndex] ?? START_FEN) : START_FEN;
  const currentMove = currentIndex > 0 ? (moves[currentIndex - 1] ?? null) : null;
  const currentEval = currentMove?.evalAfter ?? (moves[0]?.evalBefore ?? null);
  const boardMoveCount = hasGame ? fens.length - 1 : 0;

  const boardSize = Math.round(BASE_BOARD_SIZE * (prefs.boardSize / 100));
  const boardColor = BOARD_COLORS.find((c) => c.id === prefs.boardColorId) ?? BOARD_COLORS[0];
  const pieceSet = PIECE_SETS.find((p) => p.id === prefs.pieceSetId) ?? PIECE_SETS[0];

  const customPieces = useMemo(() => buildPieceImages(pieceSet.path), [pieceSet.path]);

  return (
    <div className="h-dvh bg-base text-base flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center gap-4 px-5 py-2.5 bg-surface border-b border-base"
        style={{ boxShadow: 'var(--header-shadow)' }}
      >
        <button onClick={reset} className="flex items-center gap-2 cursor-pointer shrink-0 hover-surface rounded px-1 py-0.5 transition-colors">
          <span className="text-accent text-xl leading-none select-none">♟</span>
          <span className="font-semibold text-sm tracking-tight text-base whitespace-nowrap">
            Yel Satranç Analiz
          </span>
        </button>

        <div className="flex-1 text-center text-xs text-muted truncate hidden md:block">
          {metadata
            ? `${metadata.white} — ${metadata.black}`
            : 'Motor destekli satranç analiz aracı'}
          {metadata?.event && metadata.event !== 'Unknown Event' && (
            <span className="ml-2 text-faint">· {metadata.event}</span>
          )}
        </div>

        {status === 'error' ? (
          <button
            onClick={reset}
            className="shrink-0 text-xs border rounded px-2 py-1 transition-colors hover-surface"
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
          >
            Hata — Sıfırla
          </button>
        ) : (
          <div className="w-24 shrink-0 hidden md:block" />
        )}
      </header>

      {/* ── Main layout ────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row overflow-hidden">
        {/* Board column — scrolls vertically if board is tall */}
        <div className="flex flex-col items-center gap-2 p-3 xl:p-4 xl:shrink-0 overflow-y-auto overflow-x-hidden">
          <div className="flex gap-2 items-stretch" style={{ height: boardSize }}>
            <EvalBar eval_={currentEval} height={boardSize} />
            <div style={{ width: boardSize, height: boardSize }}>
              <Chessboard
                options={{
                  position: currentFen,
                  allowDragging: false,
                  darkSquareStyle: { backgroundColor: boardColor.dark },
                  lightSquareStyle: { backgroundColor: boardColor.light },
                  boardStyle: {
                    width: boardSize,
                    height: boardSize,
                    borderRadius: 4,
                    overflow: 'hidden',
                  },
                  pieces: customPieces as never,
                }}
              />
            </div>
          </div>

          <div style={{ width: boardSize + 30 }}>
            <NavigationControls
              currentIndex={currentIndex}
              totalMoves={boardMoveCount}
              onNavigate={navigate}
            />
          </div>

          <div style={{ width: boardSize + 30 }}>
            <MoveDetail move={currentMove} />
          </div>
        </div>

        {/* Right panel — flex child stretches to full height in xl:flex-row */}
        <div className="flex flex-col border-t border-base xl:border-t-0 xl:border-l xl:shrink-0 xl:w-80 min-h-0 overflow-hidden">
          <RightPanel />
        </div>
      </div>
    </div>
  );
}
