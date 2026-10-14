// Chess.com ↔ Lichess rating dönüşümü, oyun kalitesi üzerinden eşleme (equating).
//   node scripts/calibrate/scale.mjs lichess-eval.jsonl chesscom-eval.jsonl src/lib/performance/calibration.json
//
// İki sitenin oyunları AYNI motor ve derinlikle analiz edilmiştir (evaluate.mjs). Her site
// ve hız için E[doğruluk | rating] ikinci dereceden eğriyle kestirilir; aynı beklenen
// doğruluğa sahip rating'ler eşlenir. Belirsizlik: oyunların bootstrap'i.
// Sonuç calibration.json'daki `scaleConversion` alanına yazılır (diğer alanlar korunur).
import { readFileSync, writeFileSync } from 'node:fs';
import { sideMoves } from './lib.mjs';

const [, , liFile, ccFile, calFile] = process.argv;
if (!liFile || !ccFile || !calFile) throw new Error('kullanım: scale.mjs lichess-eval.jsonl chesscom-eval.jsonl calibration.json');

const cal = JSON.parse(readFileSync(calFile, 'utf8'));
const keep = (m) => m.ply >= cal.filter.minPly && !m.forced && Math.abs(m.before) < cal.filter.maxAbsCp;
const moveAcc = (wl) => 103.1668 * Math.exp(-0.04354 * wl) - 3.1669;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const MIN_SCORED = 8;

/** Oyun -> iki oyuncu-oyun noktası { rating, acc }. Oyun bazında gruplu (bootstrap için). */
function load(file) {
  const out = { blitz: [], rapid: [] };
  for (const line of readFileSync(file, 'utf8').trim().split('\n')) {
    const g = JSON.parse(line);
    if (!out[g.speed]) continue;
    const s = sideMoves(g.plies);
    if (!s) continue;
    const pts = [];
    for (const [ms, rating] of [[s.w, g.whiteElo], [s.b, g.blackElo]]) {
      const k = ms.filter(keep);
      if (k.length >= MIN_SCORED) pts.push({ rating, acc: mean(k.map((m) => moveAcc(m.wl))) });
    }
    if (pts.length) out[g.speed].push(pts);
  }
  return out;
}

const GRID = Array.from({ length: (2700 - 400) / 25 + 1 }, (_, i) => 400 + i * 25);

/** Percentile of the ratings (range where a site's curve is supported by data). */
function pct(points, q) {
  const r = points.map((p) => p.rating).sort((a, b) => a - b);
  return r[Math.min(r.length - 1, Math.floor(q * r.length))];
}

/**
 * E[accuracy | rating] as a quadratic in rating (OLS). Single-game accuracy is
 * noisy (r ≈ 0.35 with rating), so a smooth global curve is far more stable than
 * a local one. Returns null at ratings outside the 2.5–97.5 % data range or where
 * the curve stops increasing.
 */
function curve(points) {
  const xs = points.map((p) => (p.rating - 1500) / 1000), ys = points.map((p) => p.acc);
  // normal equations for y = c0 + c1 x + c2 x²
  const S = Array.from({ length: 5 }, (_, k) => xs.reduce((t, x) => t + x ** k, 0));
  const T = Array.from({ length: 3 }, (_, k) => xs.reduce((t, x, i) => t + x ** k * ys[i], 0));
  const A = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  const c = [0, 1, 2].map((j) => det(A.map((row, i) => row.map((v, k) => (k === j ? T[i] : v)))) / D);
  const lo = pct(points, 0.025), hi = pct(points, 0.975);
  return GRID.map((r) => {
    const x = (r - 1500) / 1000;
    if (r < lo || r > hi || c[1] + 2 * c[2] * x <= 0) return null;
    return c[0] + c[1] * x + c[2] * x * x;
  });
}

/** Eğri üzerinde doğruluk `a`'ya karşılık gelen rating (doğrusal ara değer), aralık dışıysa null. */
function inverse(c, a) {
  for (let i = 1; i < GRID.length; i++) {
    const lo = c[i - 1], hi = c[i];
    if (lo === null || hi === null) continue;
    if (a >= lo && a <= hi && hi > lo) return GRID[i - 1] + ((a - lo) / (hi - lo)) * (GRID[i] - GRID[i - 1]);
  }
  return null;
}

function convert(ccPts, liPts) {
  const cc = curve(ccPts), li = curve(liPts);
  return GRID.map((r, i) => (cc[i] === null ? null : inverse(li, cc[i])));
}

let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const resample = (games) => Array.from({ length: games.length }, () => games[Math.floor(rnd() * games.length)]).flat();

const li = load(liFile), cc = load(ccFile);
const B = 200;
const result = {};
for (const speed of ['blitz', 'rapid']) {
  console.error(`\n${speed}: lichess ${li[speed].length} oyun, chess.com ${cc[speed].length} oyun`);
  const point = convert(cc[speed].flat(), li[speed].flat());
  const boots = Array.from({ length: B }, () => convert(resample(cc[speed]), resample(li[speed])));
  const rows = [];
  GRID.forEach((r, i) => {
    const vals = boots.map((b) => b[i]).filter((v) => v !== null);
    if (point[i] === null || vals.length < 0.9 * B || r % 100 !== 0) return;
    const m = mean(vals);
    rows.push({ chesscom: r, lichess: Math.round(point[i]), se: Math.round(Math.sqrt(mean(vals.map((v) => (v - m) ** 2)))) });
  });
  result[speed] = rows;
  console.error('chess.com → lichess (±SE)');
  for (const row of rows) console.error(`  ${row.chesscom} → ${row.lichess} ±${row.se}  (fark ${row.lichess - row.chesscom >= 0 ? '+' : ''}${row.lichess - row.chesscom})`);
}

cal.scaleConversion = {
  method: 'aynı motorla (Stockfish 18, derinlik 12) analiz edilmiş oyunlarda E[doğruluk | rating] eşlemesi',
  source: `lichess ${li.blitz.length + li.rapid.length}, chess.com ${cc.blitz.length + cc.rapid.length} oyun (2025–2026, blitz/rapid)`,
  ...result,
};
writeFileSync(calFile, JSON.stringify(cal, null, 2) + '\n');
console.error(`\nyazıldı: ${calFile}`);
