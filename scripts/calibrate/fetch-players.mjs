// Seçilen lichess oyuncuları için son analizli oyunları çeker (oyuncu bazlı
// doğrulama kümesi).  Herkese açık API, kimlik doğrulaması yok, tek seferde tek istek.
//
//   node scripts/calibrate/fetch-players.mjs rows.json players.jsonl [perBand=100] [games=40]
//
// Yeniden başlatılabilir: players.jsonl içinde olan oyuncular atlanır.
// Satır: { name, games: [{ white, elo, opp, event, result, init, inc, clocks, plies:[{san,eval}] }] }
//   result: oyuncu bakışıyla 1 / 0.5 / 0; clocks: ply başına kalan süre (sn); init/inc saniye.
// NAMES_FROM=eski.jsonl verilirse yalnızca o dosyada kullanılabilir (oyunu olan) oyuncular çekilir.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [, , rowsFile, outFile, perBandArg, gamesArg] = process.argv;
if (!rowsFile || !outFile) throw new Error('kullanım: fetch-players.mjs rows.json players.jsonl [perBand] [games]');
const PER_BAND = Number(perBandArg ?? 100);
const MAX_GAMES = Number(gamesArg ?? 40);
const MIN_GAMES = 10;

const rows = JSON.parse(readFileSync(rowsFile, 'utf8'));
const byBand = new Map();
for (const r of rows) {
  const k = Math.floor((r.elo - 800) / 200);
  if (k < 0 || k > 7) continue;
  if (!byBand.has(k)) byBand.set(k, new Set());
  byBand.get(k).add(r.name);
}
// kararlı, tekrarlanabilir seçim
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const names = [];
for (const [, set] of [...byBand.entries()].sort((a, b) => a[0] - b[0])) {
  names.push(...[...set].sort((a, b) => hash(a) - hash(b)).slice(0, PER_BAND));
}
// bantlar iç içe girsin ki yarıda kesilse de dengeli kalsın
let order = [];
for (let i = 0; i < PER_BAND; i++) for (let k = 0; k < 8; k++) if (names[k * PER_BAND + i]) order.push(names[k * PER_BAND + i]);
if (process.env.NAMES_FROM) {
  const ok = new Set(
    readFileSync(process.env.NAMES_FROM, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.games.length).map((x) => x.name),
  );
  order = order.filter((n) => ok.has(n));
}

const done = new Set();
if (existsSync(outFile)) {
  for (const l of readFileSync(outFile, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).name);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = new Set(['blitz', 'rapid', 'classical']);

function toPlies(g) {
  const sans = g.moves.split(' ');
  if (!g.analysis || g.analysis.length < sans.length - 1) return null;
  const plies = [];
  for (let i = 0; i < sans.length; i++) {
    const a = g.analysis[i] ?? g.analysis[i - 1];
    if (!a) return null;
    plies.push({ san: sans[i], eval: a.mate !== undefined ? { mate: a.mate } : { cp: a.eval } });
  }
  return plies;
}

async function fetchPlayer(name) {
  const url =
    `https://lichess.org/api/games/user/${encodeURIComponent(name)}` +
    `?max=${MAX_GAMES}&rated=true&analysed=true&evals=true&moves=true&clocks=true&opening=false&perfType=blitz,rapid,classical`;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res, text;
    try {
      res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });
      if (res.status === 429) {
        console.error('429, 65s bekleniyor');
        await sleep(65_000);
        continue;
      }
      if (!res.ok) return null;
      text = await res.text();
    } catch (err) {
      console.error(`ağ hatası (${name}, deneme ${attempt + 1}): ${err.cause?.code ?? err.message}`);
      await sleep(5_000 * (attempt + 1));
      continue;
    }
    const games = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const g = JSON.parse(line);
      if (!KEEP.has(g.speed) || g.variant !== 'standard') continue;
      const plies = toPlies(g);
      if (!plies || plies.length < 20) continue;
      const white = g.players.white.user?.name?.toLowerCase() === name.toLowerCase();
      const me = white ? g.players.white : g.players.black;
      const opp = white ? g.players.black : g.players.white;
      if (!me.rating || !opp.rating) continue;
      const result = g.winner === undefined ? 0.5 : (g.winner === 'white') === white ? 1 : 0;
      const clocks = Array.isArray(g.clocks) && g.clocks.length >= plies.length - 1 ? g.clocks.map((c) => c / 100) : null;
      games.push({
        white, elo: me.rating, opp: opp.rating, event: g.speed, result,
        init: g.clock?.initial ?? null, inc: g.clock?.increment ?? null, clocks, plies,
      });
    }
    return games;
  }
  return null;
}

let n = 0, kept = 0;
for (const name of order) {
  if (done.has(name)) continue;
  const games = await fetchPlayer(name);
  n++;
  if (games && games.length >= MIN_GAMES) {
    appendFileSync(outFile, JSON.stringify({ name, games }) + '\n');
    kept++;
  } else {
    appendFileSync(outFile, JSON.stringify({ name, games: [] }) + '\n'); // tekrar denememek için
  }
  if (n % 20 === 0) console.error(`${n} oyuncu denendi, ${kept} kullanılabilir`);
  await sleep(1200);
}
console.error(`bitti: ${n} denendi, ${kept} kullanılabilir`);
