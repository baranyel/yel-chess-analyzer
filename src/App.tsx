import { useMemo, useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { useAnalysis } from './context/AnalysisContext';
import { usePrefs } from './context/PrefsContext';
import { EvalBar } from './components/EvalBar';
import { MoveDetail } from './components/MoveDetail';
import { NavigationControls } from './components/NavigationControls';
import { RightPanel } from './components/RightPanel';
import { BOARD_COLORS, PIECE_SETS } from './lib/themes';
import { CLASSIFICATION_STYLES, type ClassificationStyle } from './lib/classification';
import type { MoveClassification } from './lib/types';

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
          src={`${import.meta.env.BASE_URL}${path}/${p}.svg`}
          style={{ width: squareWidth, height: squareWidth }}
          alt={p}
          draggable={false}
        />
      ),
    ]),
  );
}

// Converts a square name ("e4") to pixel offsets from the board's top-left corner.
// Assumes white is at the bottom (standard orientation).
function squareToOffset(square: string, boardSize: number) {
  const col  = square.charCodeAt(0) - 97;          // 'a'=0 … 'h'=7
  const rank = parseInt(square[1]!, 10);            // '1'=1 … '8'=8
  const sz   = boardSize / 8;
  return { x: col * sz, y: (8 - rank) * sz };
}

const HIDDEN: MoveClassification[] = ['unknown'];

function ClassificationBadge({
  uci,
  classification,
  boardSize,
}: {
  uci: string;
  classification: MoveClassification;
  boardSize: number;
}) {
  if (HIDDEN.includes(classification)) return null;
  const dest  = uci.slice(2, 4);
  const style: ClassificationStyle = CLASSIFICATION_STYLES[classification];
  const sz    = boardSize / 8;
  const badge = Math.round(sz * 0.38);
  const { x, y } = squareToOffset(dest, boardSize);

  return (
    <div
      style={{
        position: 'absolute',
        left:  x + sz - badge * 0.6,
        top:   y + sz - badge * 0.6,
        width:  badge,
        height: badge,
        borderRadius: '50%',
        backgroundColor: style.color,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(badge * 0.42),
        fontWeight: 900,
        lineHeight: 1,
        border: '2px solid rgba(255,255,255,0.75)',
        pointerEvents: 'none',
        zIndex: 20,
        letterSpacing: '-0.5px',
        userSelect: 'none',
      }}
    >
      {style.icon}
    </div>
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

  // Cap board size so it always fits on screen (padding 12px each side + eval bar ~34px)
  const [maxBoard, setMaxBoard] = useState(() => window.innerWidth - 72);
  useEffect(() => {
    const handler = () => setMaxBoard(window.innerWidth - 72);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const boardSize = Math.min(Math.round(BASE_BOARD_SIZE * (prefs.boardSize / 100)), maxBoard);
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
          <span className="shrink-0 hidden md:block text-[10px] text-faint font-mono select-none">
            v{__APP_VERSION__}
          </span>
        )}
      </header>

      {/* ── Main layout ────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row xl:justify-center overflow-hidden">
        {/* Board column — scrolls vertically if board is tall */}
        <div className="flex flex-col items-center gap-2 p-3 xl:p-4 xl:shrink-0 overflow-y-auto overflow-x-hidden">
          <div className="flex gap-2 items-stretch" style={{ height: boardSize }}>
            <EvalBar eval_={currentEval} height={boardSize} />
            <div style={{ width: boardSize, height: boardSize, position: 'relative' }}>
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
              {currentMove && (
                <ClassificationBadge
                  uci={currentMove.uci}
                  classification={currentMove.classification}
                  boardSize={boardSize}
                />
              )}
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
        <div className="flex flex-col border-t border-base xl:border-t-0 xl:border-l xl:shrink-0 xl:w-96 min-h-0 overflow-hidden">
          <RightPanel />
        </div>
      </div>
    </div>
  );
}
