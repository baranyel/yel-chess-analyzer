// PR (sonuç tabanlı performans rating'i), doğruluk tabanlı tahmin ve birleşimleri.
//   node scripts/calibrate/experiment-pr.mjs players2.jsonl
//
// Oyuncu başına ilk N=15 oyun tahmin için; kalan oyunlar (varsa) tahminin sonraki
// sonuçları açıklayıp açıklamadığını sınamak için ayrılır.
import { readFileSync } from 'node:fs';
import { sideMoves } from './lib.mjs';

const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const N = 15;

const keep = (m) => m.ply >= 10 && !m.forced && Math.abs(m.before) < 400;
const moveAcc = (wl) => 103.1668 * Math.exp(-0.04354 * wl) - 3.1669;
const accuracy = (ms) => mean(ms.map((m) => moveAcc(m.wl)));

const players = [];
for (const p of lines) {
  if (p.games.length < N) continue;
  const games = [];
  for (const g of p.games) {
    const s = sideMoves(g.plies);
    if (s) games.push({ ...g, moves: (g.white ? s.w : s.b).filter(keep) });
  }
  if (games.length >= N) players.push({ name: p.name, games });
}
console.log(`oyuncu: ${players.length}`);

const rating = (gs) => mean(gs.map((g) => g.elo));
const pr = (gs) => {
  const S = (gs.reduce((s, g) => s + g.result, 0) + 0.5) / (gs.length + 1);
  return mean(gs.map((g) => g.opp)) + 400 * Math.log10(S / (1 - S));
};

// API oyunları en yeniden eskiye verir. Sonraki-sonuç testi için kronolojik sıra:
// tahmin daha eski N oyundan, test bunlardan SONRA oynanan oyunlardan.
const data = players.map((p) => {
  const chrono = [...p.games].reverse();
  const head = chrono.slice(0, N), tail = chrono.slice(N);
  const ms = head.flatMap((g) => g.moves);
  return { p, head, tail, elo: rating(head), acc: accuracy(ms), pr: pr(head), opp: mean(head.map((g) => g.opp)) };
});

// ── doğruluk -> rating (çapraz doğrulamalı OLS) ───────────────────────────
function fit(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}
const accPred = new Array(data.length);
for (let f = 0; f < 5; f++) {
  const tr = data.filter((d) => hash(d.p.name) % 5 !== f);
  const { a, b } = fit(tr.map((d) => d.acc), tr.map((d) => d.elo));
  data.forEach((d, i) => { if (hash(d.p.name) % 5 === f) accPred[i] = a + b * d.acc; });
}

const err = (pred) => data.map((d, i) => pred(d, i) - d.elo);
const report = (name, e) => {
  const abs = e.map(Math.abs);
  const sorted = [...abs].sort((x, y) => x - y);
  console.log(
    name.padEnd(34),
    'MAE', String(Math.round(mean(abs))).padStart(4),
    ' RMSE', String(Math.round(Math.sqrt(mean(e.map((x) => x * x))))).padStart(4),
    ' medyan', String(Math.round(sorted[Math.floor(sorted.length / 2)])).padStart(4),
    ' %80 hata ≤', String(Math.round(sorted[Math.floor(sorted.length * 0.8)])).padStart(4),
    ' yanlılık', String(Math.round(mean(e))).padStart(4),
  );
};

console.log('\n— 15 oyun, hedef: oyuncunun oyunlardaki ortalama rating\'i —');
report('yalnızca ort. rakip (taban)', err((d) => d.opp));
report('doğruluk (çapraz doğrulamalı)', err((d, i) => accPred[i]));
report('PR', err((d) => d.pr));

// ters varyans ağırlıklı birleşim: ağırlık w, PR payı. Çapraz doğrulama ile w seç
const eAcc = err((d, i) => accPred[i]), ePr = err((d) => d.pr);
const vAcc = mean(eAcc.map((e) => e * e)), vPr = mean(ePr.map((e) => e * e));
const wPr = vAcc / (vAcc + vPr);
console.log(`\nters varyans ağırlığı: PR ${wPr.toFixed(2)}, doğruluk ${(1 - wPr).toFixed(2)}`);
report('birleşik (ters varyans)', err((d, i) => wPr * d.pr + (1 - wPr) * accPred[i]));
for (const w of [0.3, 0.5, 0.7]) report(`birleşik w_PR=${w}`, err((d, i) => w * d.pr + (1 - w) * accPred[i]));

// ── "performans farkı": tahmin − platform rating. Bu fark sonraki sonuçları açıklar mı? ─
// Beklenen skor, rating farkına göre; sonraki oyunlarda gerçek skor − beklenen skor
// ile (tahmin − rating) arasındaki korelasyon. Pozitifse tahmin, rating'in söylemediği bilgi taşıyor.
const expScore = (diff) => 1 / (1 + 10 ** (-diff / 400));
const rows = data.filter((d) => d.tail.length >= 8).map((d) => {
  const resid = mean(d.tail.map((g) => g.result - expScore(g.elo - g.opp)));
  return { resid, dAcc: accPred[data.indexOf(d)] - d.elo, dPr: d.pr - d.elo, dBoth: wPr * d.pr + (1 - wPr) * accPred[data.indexOf(d)] - d.elo };
});
const corr = (x, y) => {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
console.log(`\n— Sonraki ${rows.length} oyuncunun kalan oyunları: (tahmin − rating) ↔ gerçek−beklenen skor —`);
console.log('doğruluk farkı  r =', corr(rows.map((r) => r.dAcc), rows.map((r) => r.resid)).toFixed(2));
console.log('PR farkı        r =', corr(rows.map((r) => r.dPr), rows.map((r) => r.resid)).toFixed(2));
console.log('birleşik fark   r =', corr(rows.map((r) => r.dBoth), rows.map((r) => r.resid)).toFixed(2));
