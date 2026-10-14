// games.jsonl -> oyuncu-oyun başına hamle bazlı özellikler (rows.json).
//   node scripts/calibrate/features.mjs games.jsonl rows.json
//
// Her hamle için: ply, forced (tek yasal hamle), before/after (oyuncu bakışıyla,
// ±1000 cp'ye kıstırılmış), winBefore/winAfter (uygulamanın cpToWinPct'i ile).
import { readFileSync, writeFileSync } from 'node:fs';
import { sideMoves } from './lib.mjs';

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) throw new Error('kullanım: node features.mjs games.jsonl rows.json');
const games = readFileSync(inFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const rows = [];
let bad = 0;
for (const g of games) {
  const sides = sideMoves(g.plies);
  if (!sides) {
    bad++;
    continue;
  }
  rows.push({ elo: g.whiteElo, opp: g.blackElo, name: g.white, event: g.event, base: g.base, inc: g.inc, moves: sides.w });
  rows.push({ elo: g.blackElo, opp: g.whiteElo, name: g.black, event: g.event, base: g.base, inc: g.inc, moves: sides.b });
}
writeFileSync(outFile, JSON.stringify(rows));
console.error(`satır: ${rows.length}, atlanan oyun: ${bad}`);
