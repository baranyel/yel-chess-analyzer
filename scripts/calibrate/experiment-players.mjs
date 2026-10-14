// Oyuncu bazlı değerlendirme: aynı oyuncunun ilk N oyunu birleştirilir (gerçek
// "hesap analizi" senaryosu).  Hedef: oyuncunun oyunlardaki ortalama rating'i.
//   node scripts/calibrate/experiment-players.mjs players.jsonl
//
// 5 katlı çapraz doğrulama, oyuncu adına göre ayrılır.
import { readFileSync } from 'node:fs';
import { sideMoves } from './lib.mjs';

const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

// ── oyuncu -> oyun başına hamleler ────────────────────────────────────────
const players = [];
for (const p of lines) {
  if (!p.games.length) continue;
  const games = [];
  for (const g of p.games) {
    const s = sideMoves(g.plies);
    if (!s) continue;
    games.push({ elo: g.elo, moves: g.white ? s.w : s.b });
  }
  if (games.length >= 10) players.push({ name: p.name, elo: mean(games.map((g) => g.elo)), games });
}
console.log(`oyuncu: ${players.length}  (ort. rating ${Math.round(mean(players.map((p) => p.elo)))})`);

// ── filtre + özellikler ───────────────────────────────────────────────────
const keep = (m) => m.ply >= 10 && !m.forced && Math.abs(m.before) < 400;
const moveAcc = (wl) => 103.1668 * Math.exp(-0.04354 * wl) - 3.1669;
const F = {
  acc: (ms) => mean(ms.map((m) => moveAcc(m.wl))),
  lnWl: (ms) => Math.log(mean(ms.map((m) => m.wl)) + 0.5),
  lnAcpl: (ms) => Math.log(mean(ms.map((m) => Math.max(0, m.before - m.after))) + 1),
  big: (ms) => Math.log(ms.filter((m) => m.wl > 10).length / ms.length + 0.01),
};
const feats = (games, n, filterFn = keep) => {
  const ms = games.slice(0, n).flatMap((g) => g.moves.filter(filterFn));
  return ms.length >= 20 ? ms : null;
};

// ── OLS (normal denklemler) ───────────────────────────────────────────────
function ols(X, y) {
  const k = X[0].length + 1;
  const A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  X.forEach((row, i) => {
    const r = [1, ...row];
    for (let a = 0; a < k; a++) { b[a] += r[a] * y[i]; for (let c = 0; c < k; c++) A[a][c] += r[a] * r[c]; }
  });
  for (let i = 0; i < k; i++) A[i][i] += 1e-6;
  // Gauss
  for (let i = 0; i < k; i++) {
    let p = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < k; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < k; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const w = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < k; c++) s -= A[i][c] * w[c];
    w[i] = s / A[i][i];
  }
  return w;
}
const apply = (w, row) => w[0] + row.reduce((s, x, i) => s + w[i + 1] * x, 0);
const corr = (x, y) => {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};

const models = {
  'doğruluk': ['acc'],
  'ln ACPL': ['lnAcpl'],
  'ln win% kaybı': ['lnWl'],
  'doğruluk + yanılgı oranı': ['acc', 'big'],
  'doğruluk + ln win% + yanılgı': ['acc', 'lnWl', 'big'],
};

console.log('\nN oyun | model                          |   r  | MAE | RMSE | bant yanlılığı (düşük→yüksek rating çeyrekleri)');
for (const N of [5, 10, 15]) {
  for (const [mname, fnames] of Object.entries(models)) {
    const data = players.map((p) => {
      const ms = feats(p.games, N);
      return ms ? { p, x: fnames.map((f) => F[f](ms)) } : null;
    }).filter(Boolean);
    const preds = new Array(data.length);
    for (let fold = 0; fold < 5; fold++) {
      const tr = data.filter((d) => hash(d.p.name) % 5 !== fold);
      const w = ols(tr.map((d) => d.x), tr.map((d) => d.p.elo));
      data.forEach((d, i) => { if (hash(d.p.name) % 5 === fold) preds[i] = apply(w, d.x); });
    }
    const err = data.map((d, i) => preds[i] - d.p.elo);
    const idx = data.map((_, i) => i).sort((a, b) => data[a].p.elo - data[b].p.elo);
    const q = [0, 1, 2, 3].map((k) => {
      const s = idx.slice(Math.floor((k * idx.length) / 4), Math.floor(((k + 1) * idx.length) / 4));
      return Math.round(mean(s.map((i) => err[i])));
    });
    console.log(
      String(N).padStart(6), '|', mname.padEnd(30), '|',
      corr(preds, data.map((d) => d.p.elo)).toFixed(2).padStart(5), '|',
      String(Math.round(mean(err.map(Math.abs)))).padStart(3), '|',
      String(Math.round(Math.sqrt(mean(err.map((e) => e * e))))).padStart(4), '|',
      q.join(' ').padStart(20),
    );
  }
}

// ── güvenilirlik: tek/çift oyun yarılarının korelasyonu ────────────────────
console.log('\n— Oyuncu içi güvenilirlik (tek/çift oyun yarıları, doğruluk özelliği) —');
const a = [], b = [];
for (const p of players) {
  const odd = feats(p.games.filter((_, i) => i % 2 === 0), 99), even = feats(p.games.filter((_, i) => i % 2 === 1), 99);
  if (odd && even) { a.push(F.acc(odd)); b.push(F.acc(even)); }
}
console.log(`r(yarı1, yarı2) = ${corr(a, b).toFixed(2)}  n=${a.length}`);
const sdAll = Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
const sdWithin = Math.sqrt(mean(a.map((x, i) => ((x - b[i]) ** 2) / 2)));
console.log(`oyuncular arası SD(doğruluk)=${sdAll.toFixed(1)}  oyuncu içi SD (yarım set)=${sdWithin.toFixed(1)}`);
