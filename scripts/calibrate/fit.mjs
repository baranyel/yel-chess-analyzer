// Uygulamanın kullandığı kalibrasyonu üretir: src/lib/performance/calibration.json
//   node scripts/calibrate/fit.mjs players2.jsonl src/lib/performance/calibration.json
//
// Girdi: fetch-players.mjs çıktısı (oyuncu başına analizli lichess oyunları,
// sonuç ve saatlerle). Her oyun sayısı N için oyuncuların ardışık N oyunluk
// pencereleri kullanılır; hata payları oyuncu bazlı 5 katlı çapraz doğrulamayla
// ölçülür, katsayılar tüm veriyle fit edilir.
import { readFileSync, writeFileSync } from 'node:fs';
import { gameTimeFeatures, sideMoves } from './lib.mjs';

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) throw new Error('kullanım: fit.mjs players2.jsonl calibration.json');

// Uygulamadaki filtreyle aynı (src/lib/performance/filter.ts)
const FILTER = { minPly: 10, maxAbsCp: 400 };
const keep = (m) => m.ply >= FILTER.minPly && !m.forced && Math.abs(m.before) < FILTER.maxAbsCp;
const moveAcc = (wl) => 103.1668 * Math.exp(-0.04354 * wl) - 3.1669;

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const rms = (a) => Math.sqrt(mean(a.map((x) => x * x)));

// ── oyun özetleri ─────────────────────────────────────────────────────────
const players = [];
let gameCount = 0;
for (const line of readFileSync(inFile, 'utf8').trim().split('\n')) {
  const p = JSON.parse(line);
  if (!p.games.length) continue;
  const games = [];
  for (const g of [...p.games].reverse()) { // kronolojik
    const s = sideMoves(g.plies);
    if (!s) continue;
    const all = g.white ? s.w : s.b;
    const ms = all.filter(keep);
    if (ms.length < 5) continue;
    games.push({
      elo: g.elo, opp: g.opp, result: g.result,
      n: ms.length,
      accSum: ms.reduce((t, m) => t + moveAcc(m.wl), 0),
      cplSum: ms.reduce((t, m) => t + Math.max(0, m.before - m.after), 0),
      time: gameTimeFeatures(g, all),
    });
  }
  if (games.length >= 10) { players.push({ name: p.name, games }); gameCount += games.length; }
}
console.error(`oyuncu: ${players.length}, oyun: ${gameCount}`);

// ── pencereler ────────────────────────────────────────────────────────────
function windows(N, maxPerPlayer) {
  const out = [];
  for (const p of players) {
    for (let k = 0; k + N <= p.games.length && k / N < maxPerPlayer; k += N) {
      const w = p.games.slice(k, k + N);
      const n = w.reduce((t, g) => t + g.n, 0);
      const S = (w.reduce((t, g) => t + g.result, 0) + 0.5) / (N + 1);
      out.push({
        name: p.name,
        elo: mean(w.map((g) => g.elo)),
        acc: w.reduce((t, g) => t + g.accSum, 0) / n,
        lnAcpl: Math.log(w.reduce((t, g) => t + g.cplSum, 0) / n + 1),
        pr: mean(w.map((g) => g.opp)) + 400 * Math.log10(S / (1 - S)),
      });
    }
  }
  return out;
}

function fitLine(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/** Oyuncu bazlı 5 katlı CV tahminleri (özellik -> rating). */
function cvPredict(ws, key) {
  const pred = new Array(ws.length);
  for (let f = 0; f < 5; f++) {
    const tr = ws.filter((w) => hash(w.name) % 5 !== f);
    const { a, b } = fitLine(tr.map((w) => w[key]), tr.map((w) => w.elo));
    ws.forEach((w, i) => { if (hash(w.name) % 5 === f) pred[i] = a + b * w[key]; });
  }
  return pred;
}

const GAME_COUNTS = [1, 3, 5, 10, 15, 25];
const accuracy = [], acpl = [], pr = [], combined = [];
console.error('\n  N | pencere | doğruluk RMSE | ACPL RMSE | PR RMSE | birleşik RMSE (w_PR) | %80 kapsama');
for (const N of GAME_COUNTS) {
  const ws = windows(N, N === 1 ? 12 : 6);
  const pAcc = cvPredict(ws, 'acc'), pAcpl = cvPredict(ws, 'lnAcpl');
  const eAcc = ws.map((w, i) => pAcc[i] - w.elo);
  const eAcpl = ws.map((w, i) => pAcpl[i] - w.elo);
  const ePr = ws.map((w) => w.pr - w.elo);
  const rAcc = rms(eAcc), rAcpl = rms(eAcpl), rPr = rms(ePr);
  const wPr = rAcc ** 2 / (rAcc ** 2 + rPr ** 2);
  const eComb = ws.map((w, i) => wPr * w.pr + (1 - wPr) * pAcc[i] - w.elo);
  const rComb = rms(eComb);
  const cover = mean(eComb.map((e) => (Math.abs(e) <= 1.2816 * rComb ? 1 : 0)));

  const fa = fitLine(ws.map((w) => w.acc), ws.map((w) => w.elo));
  const fc = fitLine(ws.map((w) => w.lnAcpl), ws.map((w) => w.elo));
  accuracy.push({ games: N, a: +fa.a.toFixed(2), b: +fa.b.toFixed(4), rmse: Math.round(rAcc) });
  acpl.push({ games: N, a: +fc.a.toFixed(2), b: +fc.b.toFixed(4), rmse: Math.round(rAcpl) });
  pr.push({ games: N, rmse: Math.round(rPr) });
  combined.push({ games: N, weightPr: +wPr.toFixed(3), rmse: Math.round(rComb) });
  console.error(
    String(N).padStart(3), '|', String(ws.length).padStart(7), '|',
    String(Math.round(rAcc)).padStart(13), '|', String(Math.round(rAcpl)).padStart(9), '|',
    String(Math.round(rPr)).padStart(7), '|', `${Math.round(rComb)} (${wPr.toFixed(2)})`.padStart(20), '|',
    `${Math.round(cover * 100)}%`.padStart(11),
  );
}

// ── zaman normları: rating bandı başına oyuncu ortalamalarının yüzdelikleri ─
const TIME_KEYS = ['lowFrac', 'lowBlunderGap', 'fastBlunder', 'allocation', 'openingShare', 'leftover'];
const TIME_BANDS = [[0, 1200], [1200, 1600], [1600, 2000], [2000, 4000]];
const quantiles = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return Array.from({ length: 21 }, (_, i) => +s[Math.min(s.length - 1, Math.round((i / 20) * (s.length - 1)))].toFixed(4));
};
const timeBands = TIME_BANDS.map(([lo, hi]) => {
  const vals = Object.fromEntries(TIME_KEYS.map((k) => [k, []]));
  let n = 0;
  for (const p of players) {
    const gs = p.games.slice(-15).filter((g) => g.time);
    if (gs.length < 5) continue;
    const elo = mean(gs.map((g) => g.elo));
    if (elo < lo || elo >= hi) continue;
    n++;
    for (const k of TIME_KEYS) {
      const v = gs.map((g) => g.time[k]).filter((x) => !Number.isNaN(x));
      if (v.length >= 3) vals[k].push(mean(v));
    }
  }
  return { lo, hi, players: n, quantiles: Object.fromEntries(TIME_KEYS.map((k) => [k, quantiles(vals[k])])) };
});

const out = {
  version: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  source: `lichess, ${players.length} oyuncu, ${gameCount} analizli oyun (blitz/rapid/klasik)`,
  ratingScale: 'lichess',
  filter: FILTER,
  accuracy,
  acpl,
  pr,
  combined,
  time: { bands: timeBands },
};
writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
console.error(`\nyazıldı: ${outFile}`);
