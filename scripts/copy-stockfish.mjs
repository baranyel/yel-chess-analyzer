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

// The engine is GPL-3.0: ship the license text next to the binaries we distribute.
const license = resolve(root, 'node_modules', 'stockfish', 'Copying.txt');
if (existsSync(license)) {
  copyFileSync(license, resolve(dest, 'COPYING.txt'));
  console.log('✓  COPYING.txt (GPL-3.0)');
} else {
  console.warn('⚠  Copying.txt not found in stockfish npm package — GPL text will be missing from the build');
}
console.log('Stockfish files ready in public/stockfish/');
