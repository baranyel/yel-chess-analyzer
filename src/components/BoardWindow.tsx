import { useEffect, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { useAnalysis } from '../context/AnalysisContext';
import { usePrefs } from '../context/PrefsContext';
import { EvalBar } from './EvalBar';
import { MoveDetail } from './MoveDetail';
import { NavigationControls } from './NavigationControls';
import { PositionCard } from './PositionCard';
import { Window } from './Window';
import { BOARD_COLORS, PIECE_SETS } from '../lib/themes';
import { CLASSIFICATION_STYLES, type ClassificationStyle } from '../lib/classification';
import { loadSavedUsernames } from '../lib/accounts';
import { uciSquares } from '../lib/chessUtils';
import { badgePosition, defaultOrientation } from '../lib/orientation';
import type { MoveClassification } from '../lib/types';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BASE_BOARD_SIZE = 520;
const BEST_MOVE_ARROW_COLOR = 'rgba(34, 197, 94, 0.9)';

// Layout constants shared with App.tsx (desk padding, window chrome, side panel)
const XL_BREAKPOINT = 1280;
const SIDE_PANEL_WIDTH = 416;       // analysis window (26rem)
const BOARD_EXTRAS = 30;            // eval bar (22) + gap (8)

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

const HIDDEN: MoveClassification[] = ['unknown'];

function ClassificationBadge({
  uci,
  classification,
  boardSize,
  orientation,
}: {
  uci: string;
  classification: MoveClassification;
  boardSize: number;
  orientation: 'white' | 'black';
}) {
  if (HIDDEN.includes(classification)) return null;
  const dest  = uci.slice(2, 4);
  const style: ClassificationStyle = CLASSIFICATION_STYLES[classification];
  const sz    = boardSize / 8;
  const badge = Math.round(sz * 0.38);
  const { left, top } = badgePosition(dest, boardSize, orientation, badge);

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
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
        border: '2px solid #fff',
        boxShadow: '1px 2px 0 rgba(0,20,70,.45)',
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

/** Largest board that fits next to (xl) or above (smaller screens) the analysis window. */
function useBoardSize(percent: number): number {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const wanted = Math.round(BASE_BOARD_SIZE * (percent / 100));
  const isXl = vp.w >= XL_BREAKPOINT;
  // desk padding + window padding + eval bar + borders
  const maxWidth = isXl ? vp.w - SIDE_PANEL_WIDTH - 40 - 16 - 24 - BOARD_EXTRAS - 2 : vp.w - 24 - 24 - BOARD_EXTRAS - 2;
  // keep the controls under the board in view on wide screens
  const maxHeight = isXl ? Math.max(300, vp.h - 340) : Infinity;
  return Math.max(200, Math.min(wanted, maxWidth, maxHeight));
}

export function BoardWindow({ className = '' }: { className?: string }) {
  const { state, navigate } = useAnalysis();
  const { prefs } = usePrefs();
  const { status, fens, moves, currentIndex, metadata, positionAnalysis } = state;

  const hasGame = status !== 'idle';
  const currentFen = hasGame && fens.length > 0 ? (fens[currentIndex] ?? START_FEN) : START_FEN;
  const currentMove = currentIndex > 0 ? (moves[currentIndex - 1] ?? null) : null;
  const isFenMode = hasGame && fens.length === 1;
  const currentEval =
    currentMove?.evalAfter ?? moves[0]?.evalBefore ?? (isFenMode ? (positionAnalysis?.eval ?? null) : null);
  const boardMoveCount = hasGame ? fens.length - 1 : 0;

  const boardSize = useBoardSize(prefs.boardSize);
  const boardColor = BOARD_COLORS.find((c) => c.id === prefs.boardColorId) ?? BOARD_COLORS[0];
  const pieceSet = PIECE_SETS.find((p) => p.id === prefs.pieceSetId) ?? PIECE_SETS[0];
  const customPieces = useMemo(() => buildPieceImages(pieceSet.path), [pieceSet.path]);

  // ── Board orientation (not persisted: it follows the game being viewed) ──
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const flipBoard = () => setOrientation((o) => (o === 'white' ? 'black' : 'white'));

  // Open a game from the side the viewer played (saved Lichess / Chess.com name).
  useEffect(() => {
    if (!state.gameId) return;
    const names = loadSavedUsernames();
    setOrientation(defaultOrientation(metadata, [names.lichess, names.chesscom]));
  }, [state.gameId, metadata]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') {
        setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── "Better move" arrow ──────────────────────────────────────────────────
  // After a move that was not the engine's choice: what should have been played.
  // In FEN mode: the engine's best move for the position.
  const [showArrow, setShowArrow] = useState(true);
  const betterMove =
    currentMove?.bestMove && currentMove.bestMove !== currentMove.uci
      ? currentMove.bestMove
      : isFenMode ? (positionAnalysis?.bestMove ?? null) : null;
  const arrowSquares = showArrow ? uciSquares(betterMove) : null;
  const arrowFrom = arrowSquares?.from;
  const arrowTo = arrowSquares?.to;
  const arrows = useMemo(
    () => (arrowFrom && arrowTo
      ? [{ startSquare: arrowFrom, endSquare: arrowTo, color: BEST_MOVE_ARROW_COLOR }]
      : []),
    [arrowFrom, arrowTo],
  );

  const columnWidth = boardSize + BOARD_EXTRAS;

  return (
    <Window
      title="Tahta"
      className={className}
      bodyClassName="overflow-y-auto overflow-x-hidden"
      actions={(
        <>
          <button onClick={flipBoard} title="Tahtayı çevir (F)" className="win-btn">
            ⇅ Çevir
          </button>
          <button
            onClick={() => setShowArrow((v) => !v)}
            aria-pressed={showArrow}
            title="Daha iyi hamle okunu göster / gizle"
            className="win-btn"
          >
            Ok
          </button>
        </>
      )}
    >
      <div className="flex flex-col items-center gap-3 p-3 mx-auto" style={{ width: columnWidth + 24 }}>
        <div className="flex gap-2 items-stretch" style={{ height: boardSize }}>
          <EvalBar eval_={currentEval} height={boardSize} flipped={orientation === 'black'} />
          <div
            className="board-frame"
            style={{ width: boardSize, height: boardSize, position: 'relative' }}
          >
            <Chessboard
              options={{
                position: currentFen,
                boardOrientation: orientation,
                arrows,
                allowDragging: false,
                darkSquareStyle: { backgroundColor: boardColor.dark },
                lightSquareStyle: { backgroundColor: boardColor.light },
                boardStyle: { width: boardSize, height: boardSize },
                pieces: customPieces as never,
              }}
            />
            {currentMove && (
              <ClassificationBadge
                uci={currentMove.uci}
                classification={currentMove.classification}
                boardSize={boardSize}
                orientation={orientation}
              />
            )}
          </div>
        </div>

        <div style={{ width: columnWidth }}>
          <NavigationControls
            currentIndex={currentIndex}
            totalMoves={boardMoveCount}
            onNavigate={navigate}
          />
        </div>

        <div style={{ width: columnWidth }}>
          {isFenMode ? (
            <PositionCard fen={currentFen} analysis={positionAnalysis} analyzing={status === 'analyzing'} />
          ) : (
            <MoveDetail move={currentMove} />
          )}
        </div>
      </div>
    </Window>
  );
}
