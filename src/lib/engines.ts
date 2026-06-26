export interface EngineConfig {
  id: string;
  name: string;
  description: string;
  workerPath: string;   // served from /public
}

// Built-in engines. Add more WASM engines here — they must be placed in /public/stockfish/.
export const AVAILABLE_ENGINES: EngineConfig[] = [
  {
    id: 'stockfish-18',
    name: 'Stockfish 18',
    description: 'Stockfish 18 WASM (single-threaded)',
    workerPath: '/stockfish/stockfish-18-single.js',
  },
  {
    id: 'stockfish-18-lite',
    name: 'Stockfish 18 Lite',
    description: 'Daha hızlı, daha az hassas (küçük WASM)',
    workerPath: '/stockfish/stockfish-18-lite-single.js',
  },
];

export const DEFAULT_ENGINE_ID = 'stockfish-18';
