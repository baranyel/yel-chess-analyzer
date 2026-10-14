// Zaman yönetimi göstergeleri: rating bandına göre dağılım ve doğruluk/sonuç
// artıklarıyla ilişki.   node scripts/calibrate/experiment-time.mjs players2.jsonl
//
// Zaman yönetimi puanı rating'e girmez; ayrı bir ölçüt. Burada amaç, hangi
// göstergelerin oyun kalitesiyle tutarlı yönde ilişkili olduğunu görmek.
import { readFileSync } from 'node:fs';
import { gameTimeFeatures, sideMoves } from './lib.mjs';

const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const corr = (x, y) => {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
const moveAcc = (wl) => 103.1668 * Math.exp(-0.04354 * wl) - 3.1669;
const expScore = (diff) => 1 / (1 + 10 ** (-diff / 400));
const N = 15;

const players = [];
for (const p of lines) {
  if (p.games.length < N) continue;
  const gs = [];
  for (const g of p.games.slice(0, N)) {
    const s = sideMoves(g.plies);
    if (!s) continue;
    const moves = g.white ? s.w : s.b;
    const t = gameTimeFeatures(g, moves);
    if (t) gs.push({ g, moves, t });
  }
  if (gs.length < 10) continue;
  const agg = {};
  for (const k of Object.keys(gs[0].t)) {
    const v = gs.map((x) => x.t[k]).filter((x) => !Number.isNaN(x));
    agg[k] = v.length >= 5 ? mean(v) : NaN;
  }
  const scored = gs.flatMap((x) => x.moves.filter((m) => m.ply >= 10 && !m.forced && Math.abs(m.before) < 400));
  const tail = p.games.slice(N);
  players.push({
    name: p.name,
    elo: mean(gs.map((x) => x.g.elo)),
    acc: mean(scored.map((m) => moveAcc(m.wl))),
    resHead: mean(gs.map((x) => x.g.result - expScore(x.g.elo - x.g.opp))),
    resTail: tail.length >= 8 ? mean(tail.map((g) => g.result - expScore(g.elo - g.opp))) : NaN,
    ...agg,
  });
}
console.log(`oyuncu: ${players.length}`);

// doğruluğun rating'e göre artığı
const mx = mean(players.map((p) => p.elo)), ma = mean(players.map((p) => p.acc));
let sxy = 0, sxx = 0;
players.forEach((p) => { sxy += (p.elo - mx) * (p.acc - ma); sxx += (p.elo - mx) ** 2; });
const slope = sxy / sxx;
players.forEach((p) => { p.accResid = p.acc - (ma + slope * (p.elo - mx)); });

const keys = ['lowFrac', 'lowBlunderGap', 'fastBlunder', 'allocation', 'openingShare', 'leftover'];
console.log('\ngösterge        | ort. (rating çeyreği 1→4)            | r(rating) | r(doğruluk artığı) | r(ilk15 sonuç artığı) | r(sonraki sonuç artığı)');
const sorted = [...players].sort((a, b) => a.elo - b.elo);
for (const k of keys) {
  const ok = players.filter((p) => !Number.isNaN(p[k]));
  const q = [0, 1, 2, 3].map((i) => {
    const s = sorted.slice(Math.floor((i * sorted.length) / 4), Math.floor(((i + 1) * sorted.length) / 4)).map((p) => p[k]).filter((x) => !Number.isNaN(x));
    return s.length ? mean(s).toFixed(2) : '—';
  });
  const tail = ok.filter((p) => !Number.isNaN(p.resTail));
  console.log(
    k.padEnd(15), '|', q.join(' ').padEnd(36), '|',
    corr(ok.map((p) => p[k]), ok.map((p) => p.elo)).toFixed(2).padStart(9), '|',
    corr(ok.map((p) => p[k]), ok.map((p) => p.accResid)).toFixed(2).padStart(18), '|',
    corr(ok.map((p) => p[k]), ok.map((p) => p.resHead)).toFixed(2).padStart(21), '|',
    (tail.length > 10 ? corr(tail.map((p) => p[k]), tail.map((p) => p.resTail)).toFixed(2) : '—').padStart(22),
  );
}
