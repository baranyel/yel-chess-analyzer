// Filtre / özellik kombinasyonlarını hold-out'ta karşılaştırır.
//   node scripts/calibrate/experiment.mjs rows.json
//
// Eğitim/test oyuncu adına göre ayrılır (aynı oyuncu iki tarafta olmaz).
// Her konfigürasyon için: elo = a + b·ln(x) doğrusal fit (bant dengeli ağırlıkla),
// test'te bant bazında yanlılık, bant dengeli MAE, tek oyun korelasyonu ve
// 15 oyunluk birleştirmede MAE.
import { readFileSync } from 'node:fs';

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const isTest = (r) => hash(r.name) % 5 === 0;
const bandOf = (elo) => (elo >= 800 && elo < 2400 ? Math.floor((elo - 800) / 200) : -1);

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// ── hamle filtreleri ──────────────────────────────────────────────────────
const filters = {
  hepsi: () => true,
  'kitap<16': (m) => m.ply >= 16,
  'kitap<16,zorunlu': (m) => m.ply >= 16 && !m.forced,
  'kitap<16,zorunlu,|ev|<600': (m) => m.ply >= 16 && !m.forced && Math.abs(m.before) < 600,
  'kitap<16,zorunlu,|ev|<400': (m) => m.ply >= 16 && !m.forced && Math.abs(m.before) < 400,
  'kitap<16,zorunlu,|ev|<300': (m) => m.ply >= 16 && !m.forced && Math.abs(m.before) < 300,
  'kitap<10,zorunlu,|ev|<400': (m) => m.ply >= 10 && !m.forced && Math.abs(m.before) < 400,
};

// ── özellikler (oyuncu-oyun hamle listesi -> sayı) ─────────────────────────
const acpl = (ms) => mean(ms.map((m) => Math.max(0, m.before - m.after)));
const winLoss = (ms) => mean(ms.map((m) => m.wl));
// Lichess hamle doğruluğu (win% kaybından), oyun = ortalama
const moveAcc = (wl) => 103.1668 * Math.exp(-0.04354 * wl) - 3.1669;
const accuracy = (ms) => mean(ms.map((m) => moveAcc(m.wl)));
// Lichess oyun doğruluğu: ağırlıklı ve harmonik ortalamanın ortalaması (volatilite penceresi basitleştirildi: harmonik kısım)
const harmonic = (ms) => ms.length / ms.reduce((s, m) => s + 1 / Math.max(1, moveAcc(m.wl)), 0);
const accHarm = (ms) => (accuracy(ms) + harmonic(ms)) / 2;
// kayıp oranı: win% kaybı >10 olan hamlelerin payı (yanılgı+gaf)
const bigRate = (ms) => ms.filter((m) => m.wl > 10).length / ms.length;
const midRate = (ms) => ms.filter((m) => m.wl > 5).length / ms.length;

// x'i ln dönüşümüne sokan özellikler; doğruluk özelliği doğrudan
const features = {
  'ACPL (cp)': { f: acpl, t: (x) => Math.log(x + 1) },
  'win% kaybı': { f: winLoss, t: (x) => Math.log(x + 0.5) },
  'doğruluk (ort)': { f: accuracy, t: (x) => x },
  'doğruluk (ort+harm)': { f: accHarm, t: (x) => x },
  'yanılgı oranı (>10)': { f: bigRate, t: (x) => Math.log(x + 0.01) },
  'orta oran (>5)': { f: midRate, t: (x) => Math.log(x + 0.01) },
};

// ── ağırlıklı doğrusal regresyon ───────────────────────────────────────────
function fitLine(xs, ys, ws) {
  let sw = 0, sx = 0, sy = 0;
  for (let i = 0; i < xs.length; i++) { sw += ws[i]; sx += ws[i] * xs[i]; sy += ws[i] * ys[i]; }
  const mx = sx / sw, my = sy / sw;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += ws[i] * (xs[i] - mx) * (ys[i] - my); sxx += ws[i] * (xs[i] - mx) ** 2; }
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

const corr = (x, y) => {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const train = rows.filter((r) => !isTest(r) && bandOf(r.elo) >= 0);
const test = rows.filter((r) => isTest(r) && bandOf(r.elo) >= 0);
console.log(`eğitim: ${train.length}  test: ${test.length}\n`);

const results = [];
for (const [fname, keep] of Object.entries(filters)) {
  for (const [featName, { f, t }] of Object.entries(features)) {
    const prep = (r) => {
      const ms = r.moves.filter(keep);
      return ms.length >= 12 ? { r, ms, x: t(f(ms)) } : null;
    };
    const tr = train.map(prep).filter(Boolean);
    const te = test.map(prep).filter(Boolean);
    const counts = new Array(8).fill(0);
    tr.forEach((p) => counts[bandOf(p.r.elo)]++);
    const { a, b } = fitLine(tr.map((p) => p.x), tr.map((p) => p.r.elo), tr.map((p) => 1 / counts[bandOf(p.r.elo)]));
    const predict = (x) => Math.max(600, Math.min(2800, a + b * x));

    const bandBias = new Array(8).fill(0), bandAbs = new Array(8).fill(0), bandN = new Array(8).fill(0);
    const pr = [], ac = [];
    for (const p of te) {
      const e = predict(p.x) - p.r.elo, k = bandOf(p.r.elo);
      bandBias[k] += e; bandAbs[k] += Math.abs(e); bandN[k]++;
      pr.push(predict(p.x)); ac.push(p.r.elo);
    }
    const maeBal = mean(bandAbs.map((s, k) => s / bandN[k]));
    const maxBias = Math.max(...bandBias.map((s, k) => Math.abs(s / bandN[k])));

    // 15 oyun birleştirme: aynı banttan rastgele 15 test satırı, hamleler birleştirilir
    const errs = [];
    for (let k = 0; k < 8; k++) {
      const pool = te.filter((p) => bandOf(p.r.elo) === k);
      for (let rep = 0; rep < 60; rep++) {
        const picks = Array.from({ length: 15 }, () => pool[Math.floor(rnd() * pool.length)]);
        const ms = picks.flatMap((p) => p.ms);
        errs.push(Math.abs(predict(t(f(ms))) - mean(picks.map((p) => p.r.elo))));
      }
    }
    results.push({
      fname, featName, a, b,
      corr: corr(pr, ac), maeBal, maxBias, mae15: mean(errs),
      bias: bandBias.map((s, k) => Math.round(s / bandN[k])),
    });
  }
}

results.sort((x, y) => x.maeBal - y.maeBal);
console.log('sıra: bant dengeli MAE (tek oyun) — küçük iyi');
console.log('filtre'.padEnd(30), 'özellik'.padEnd(22), 'r'.padStart(5), 'MAE1'.padStart(6), 'MAE15'.padStart(6), 'maxBias'.padStart(8));
for (const r of results.slice(0, 18)) {
  console.log(r.fname.padEnd(30), r.featName.padEnd(22), r.corr.toFixed(2).padStart(5), String(Math.round(r.maeBal)).padStart(6), String(Math.round(r.mae15)).padStart(6), String(Math.round(r.maxBias)).padStart(8));
}
const best = results[0];
console.log(`\nen iyi: ${best.fname} + ${best.featName}: elo = ${best.a.toFixed(1)} + ${best.b.toFixed(2)}·x`);
console.log('bant yanlılığı (800..2200):', best.bias.join(' '));
const refRow = results.find((r) => r.fname === 'hepsi' && r.featName === 'ACPL (cp)');
console.log(`\nreferans (filtre yok, ACPL, yeniden fit): r=${refRow.corr.toFixed(2)} MAE1=${Math.round(refRow.maeBal)} MAE15=${Math.round(refRow.mae15)} bias=${refRow.bias.join(' ')}`);
