// Mevcut estimateElo formülünün (src/lib/classification.ts) lichess verisindeki
// yanlılığını ölçer.  Kullanım:  node scripts/calibrate/baseline.mjs games.jsonl
//
// Not: formül ve ACPL tanımı uygulamadakiyle birebir aynıdır (±1000 cp kıstırma,
// hamle öncesi eval = bir önceki ply'ın evali, sonrası = bu ply'ın evali).
import { readFileSync } from 'node:fs';

const CP_CLAMP = 1000;
const estimateElo = (acpl) =>
  acpl <= 0 ? 2900 : Math.max(800, Math.min(3000, Math.round(3491 - 403 * Math.log(acpl + 1))));

const cp = (e) => (e.mate !== undefined ? (e.mate > 0 ? CP_CLAMP : -CP_CLAMP) : Math.max(-CP_CLAMP, Math.min(CP_CLAMP, e.cp)));

/** Bir oyundaki her oyuncu için hamle kayıplarını (cp) döndürür. */
function sideLosses(game) {
  const out = { w: [], b: [] };
  let prev = { cp: 15 }; // lichess başlangıç değeri
  game.plies.forEach((p, i) => {
    const white = i % 2 === 0;
    const sign = white ? 1 : -1;
    out[white ? 'w' : 'b'].push(Math.max(0, cp(prev) * sign - cp(p.eval) * sign));
    prev = p.eval;
  });
  return out;
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const corr = (x, y) => {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
};

const file = process.argv[2];
if (!file) throw new Error('kullanım: node baseline.mjs games.jsonl');
const games = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// oyuncu-oyun satırları
const rows = [];
for (const g of games) {
  const l = sideLosses(g);
  rows.push({ elo: g.whiteElo, losses: l.w, event: g.event });
  rows.push({ elo: g.blackElo, losses: l.b, event: g.event });
}

console.log(`oyuncu-oyun: ${rows.length}\n`);
console.log('— Tek oyun —');
console.log('bant        n   medyan ACPL   ort. tahmin   yanlılık   MAE');
const bands = [];
for (let lo = 800; lo < 2400; lo += 200) bands.push(lo);
const singles = [];
for (const lo of bands) {
  const r = rows.filter((x) => x.elo >= lo && x.elo < lo + 200);
  const est = r.map((x) => estimateElo(mean(x.losses)));
  const bias = mean(est.map((e, i) => e - r[i].elo));
  const mae = mean(est.map((e, i) => Math.abs(e - r[i].elo)));
  singles.push(...r.map((x, i) => [x.elo, est[i]]));
  console.log(
    `${lo}-${lo + 199}`.padEnd(10),
    String(r.length).padStart(6),
    String(Math.round(median(r.map((x) => mean(x.losses))))).padStart(10),
    String(Math.round(mean(est))).padStart(12),
    String(Math.round(bias)).padStart(10),
    String(Math.round(mae)).padStart(6),
  );
}
console.log(
  `\nkorelasyon(gerçek, tahmin) tek oyun: ${corr(singles.map((s) => s[0]), singles.map((s) => s[1])).toFixed(2)}`,
);
console.log(`genel yanlılık: ${Math.round(mean(singles.map((s) => s[1] - s[0])))}  MAE: ${Math.round(mean(singles.map((s) => Math.abs(s[1] - s[0]))))}`);

// 15 oyunluk sahte "hesap": aynı banttan rastgele 15 oyun, hamleler birleştirilir
console.log('\n— 15 oyun birleştirilmiş (aynı banttan 300 rastgele örnek) —');
console.log('bant       ort. tahmin   yanlılık   MAE   std');
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
for (const lo of bands) {
  const r = rows.filter((x) => x.elo >= lo && x.elo < lo + 200);
  const errs = [], ests = [];
  for (let k = 0; k < 300; k++) {
    const pool = [];
    let eloSum = 0;
    for (let j = 0; j < 15; j++) {
      const x = r[Math.floor(rnd() * r.length)];
      pool.push(...x.losses);
      eloSum += x.elo;
    }
    const est = estimateElo(mean(pool));
    ests.push(est);
    errs.push(est - eloSum / 15);
  }
  const m = mean(errs);
  console.log(
    `${lo}-${lo + 199}`.padEnd(10),
    String(Math.round(mean(ests))).padStart(10),
    String(Math.round(m)).padStart(10),
    String(Math.round(mean(errs.map(Math.abs)))).padStart(6),
    String(Math.round(Math.sqrt(mean(errs.map((e) => (e - m) ** 2))))).padStart(5),
  );
}
