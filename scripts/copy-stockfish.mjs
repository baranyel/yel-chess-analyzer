// Copies Stockfish WASM/JS files from the npm package into public/stockfish/.
// Runs automatically via the "postinstall" npm script after `npm install`.
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const src  = resolve(root, 'node_modules', 'stockfish', 'bin');
const dest = resolve(root, 'public', 'stockfish');

mkdirSync(dest, { recursive: true });

const files = [
  'stockfish-18-single.js',
  'stockfish-18-single.wasm',
  'stockfish-18-lite-single.js',
  'stockfish-18-lite-single.wasm',
];

for (const f of files) {
  const from = resolve(src, f);
  const to   = resolve(dest, f);
  if (!existsSync(from)) {
    console.warn(`⚠  ${f} not found in stockfish npm package — skipping`);
    continue;
  }
  copyFileSync(from, to);
  console.log(`✓  ${f}`);
}
console.log('Stockfish files ready in public/stockfish/');
