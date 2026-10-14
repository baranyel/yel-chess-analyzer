// Örnek oyunları (sample-lichess / fetch-chesscom çıktısı) aynı motorla analiz eder.
//   node scripts/calibrate/evaluate.mjs in.jsonl out.jsonl [depth=12] [workers=11] [engine=stockfish-18]
//
// Çıktı satırı: girdi + idx + plies: [{ san, eval: {cp}|{mate} }] (beyaz bakışı, her ply'dan
// sonraki pozisyon). Mat/pat/yetersiz materyal motor yerine kurallarla değerlenir
// (uygulamadaki analyzeGame ile aynı). Yeniden başlatılabilir: out.jsonl'deki idx'ler atlanır.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { Engine } from './engine.mjs';

const [, , inFile, outFile, depthArg, workersArg, engineId] = process.argv;
if (!inFile || !outFile) throw new Error('kullanım: evaluate.mjs in.jsonl out.jsonl [depth] [workers] [engine]');
const DEPTH = Number(depthArg ?? 12);
const WORKERS = Number(workersArg ?? 11);

const games = readFileSync(inFile, 'utf8').trim().split('\n').map((l, idx) => ({ ...JSON.parse(l), idx }));
const done = new Set();
if (existsSync(outFile)) for (const l of readFileSync(outFile, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).idx);
const queue = games.filter((g) => !done.has(g.idx));
console.error(`oyun: ${games.length}, kalan: ${queue.length}, derinlik ${DEPTH}, ${WORKERS} motor`);

async function analyse(engine, g) {
  const chess = new Chess();
  const plies = [];
  for (const san of g.sans) {
    try { chess.move(san); } catch { return null; }
    let ev;
    if (chess.isCheckmate()) ev = { mate: chess.turn() === 'w' ? -1 : 1 }; // side to move is mated
    else if (chess.isStalemate() || chess.isInsufficientMaterial()) ev = { cp: 0 };
    else ev = await engine.evaluate(chess.fen(), DEPTH);
    plies.push({ san, eval: ev });
  }
  return plies;
}

let finished = 0, failed = 0;
const started = Date.now();
async function worker() {
  const engine = new Engine(engineId ?? 'stockfish-18');
  for (let g = queue.shift(); g; g = queue.shift()) {
    const plies = await analyse(engine, g);
    if (!plies) { failed++; continue; }
    const { sans: _sans, ...rest } = g;
    appendFileSync(outFile, JSON.stringify({ ...rest, plies }) + '\n');
    finished++;
    if (finished % 50 === 0) {
      const rate = finished / ((Date.now() - started) / 1000);
      console.error(`${finished} bitti, ${queue.length} kaldı, ~${Math.round(queue.length / rate / 60)} dk`);
    }
  }
  engine.quit();
}
await Promise.all(Array.from({ length: WORKERS }, worker));
console.error(`bitti: ${finished}, geçersiz: ${failed}`);
