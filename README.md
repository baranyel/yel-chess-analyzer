# FreeChess Analyzer

An open-source chess game analysis tool that runs entirely in the browser. Paste a PGN (or FEN), and Stockfish will analyze every move with centipawn evaluation, best-move suggestions, and move classification — no server required.

## Features

- **Full PGN analysis** — every move analyzed via Stockfish 18 WASM
- **Move classification** — Best / Excellent / Good / Inaccuracy / Mistake / Blunder with color-coded labels
- **Eval bar** — visual advantage indicator (chess.com style)
- **Interactive board** — click any move in the list to jump to that position; arrow keys navigate
- **Game summary** — per-player accuracy score and move classification breakdown
- **Configurable depth** — default 18, adjustable from 10 to 22
- **100% client-side** — Stockfish runs in a Web Worker; no data leaves your browser

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | React 19 + Vite 6 (TypeScript) |
| Chess engine | Stockfish 18 (WASM, single-threaded) |
| Chess rules / PGN | chess.js |
| Board UI | react-chessboard |
| Styling | Tailwind CSS v4 |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build
```

Then open `http://localhost:5173` in your browser.

## Project Structure

```
src/
├── engine/
│   ├── stockfish.worker.ts   # Web Worker running Stockfish via UCI
│   └── StockfishService.ts   # Main-thread wrapper (promise-based API)
├── lib/
│   ├── types.ts              # Shared TypeScript types
│   ├── classification.ts     # Move labeling logic + thresholds (edit here to tune)
│   └── pgn.ts                # PGN / FEN parsing helpers
├── context/
│   └── AnalysisContext.tsx   # Global state + analysis pipeline (React context)
├── components/
│   ├── PgnInput.tsx          # Entry screen with textarea input
│   ├── EvalBar.tsx           # Vertical eval bar
│   ├── MoveList.tsx          # Scrollable move list with classifications
│   ├── MoveDetail.tsx        # Detail panel for the selected move
│   ├── NavigationControls.tsx# Prev/next/start/end + keyboard bindings
│   └── GameSummary.tsx       # Post-analysis accuracy table
├── App.tsx                   # Root layout
└── main.tsx                  # Entry point
public/
└── stockfish/                # Stockfish 18 WASM files (served statically)
```

## Tuning Classification Thresholds

Edit `src/lib/classification.ts` — the `CLASSIFICATION_THRESHOLDS` constant:

```ts
export const CLASSIFICATION_THRESHOLDS = {
  best:       0,    // exact best move (0 cp loss)
  excellent:  10,   // <= 10 cp loss
  good:       25,   // <= 25 cp loss
  inaccuracy: 50,   // <= 50 cp loss
  mistake:    100,  // <= 100 cp loss
  // blunder: anything above mistake threshold
};
```

## Adding Commentary (Future)

Each analyzed move object includes an optional `commentary?: string` field (defined in `src/lib/types.ts`). The `MoveDetail` component already renders it when present. To add AI commentary, populate this field in `AnalysisContext.tsx` after each move is analyzed.

## License

MIT
