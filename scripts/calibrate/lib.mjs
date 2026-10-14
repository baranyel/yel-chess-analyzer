// Kalibrasyon scriptleri için ortak: bir oyunun her iki tarafı için hamle özellikleri.
import { Chess } from 'chess.js';

export const CP_CLAMP = 1000;
export const clampCp = (e) =>
  e.mate !== undefined ? (e.mate > 0 ? CP_CLAMP : -CP_CLAMP) : Math.max(-CP_CLAMP, Math.min(CP_CLAMP, e.cp));
// src/lib/classification.ts ile aynı sigmoid
export const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1);

/**
 * plies: [{ san, eval: {cp}|{mate} }] (beyaz bakışı). Dönen: { w, b } hamle listeleri
 * { ply, forced, before, after, wl } (oyuncu bakışı, ±1000 cp kıstırmalı). Geçersiz SAN'da null.
 */
export function sideMoves(plies) {
  const chess = new Chess();
  const out = { w: [], b: [] };
  let prev = { cp: 15 };
  for (let i = 0; i < plies.length; i++) {
    const white = i % 2 === 0;
    const sign = white ? 1 : -1;
    const forced = chess.moves().length === 1;
    try {
      chess.move(plies[i].san);
    } catch {
      return null;
    }
    const before = clampCp(prev) * sign;
    const after = clampCp(plies[i].eval) * sign;
    out[white ? 'w' : 'b'].push({
      ply: i,
      forced: forced ? 1 : 0,
      before,
      after,
      wl: Math.max(0, winPct(before) - winPct(after)),
    });
    prev = plies[i].eval;
  }
  return out;
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const corr = (x, y) => {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};

/** Bir oyunun (oyuncu tarafı) zaman göstergeleri; saat verisi yoksa null. */
export function gameTimeFeatures(g, moves) {
  if (!g.clocks || g.init == null) return null;
  const init = g.init, inc = g.inc ?? 0;
  const side = g.white ? 0 : 1;
  const own = moves.map((m) => {
    const clockAfter = g.clocks[m.ply];
    const clockBefore = m.ply >= 2 ? g.clocks[m.ply - 2] : init;
    if (clockAfter == null || clockBefore == null) return null;
    return { ...m, clockAfter, spent: Math.max(0, clockBefore + inc - clockAfter) };
  }).filter(Boolean);
  if (own.length < 15 || own[0].ply % 2 !== side) return null;

  const lowLimit = Math.max(10, 0.1 * init);
  const low = own.filter((m) => m.clockAfter < lowLimit);
  const normal = own.filter((m) => m.clockAfter >= lowLimit && m.ply >= 10 && !m.forced);
  const scored = own.filter((m) => m.ply >= 10 && !m.forced);
  const blunder = (m) => (m.wl > 10 ? 1 : 0);

  // kritiklik: dengeli pozisyon (win% 50'ye yakın) = kritik; süre ile ilişkisi
  const crit = scored.map((m) => 1 - Math.abs(winPct(m.before) - 50) / 50);
  const logT = scored.map((m) => Math.log(1 + m.spent));
  const allocation = scored.length >= 10 ? corr(crit, logT) : NaN;

  const total = own.reduce((s, m) => s + m.spent, 0) || 1;
  const open = own.filter((m) => m.ply < 20).reduce((s, m) => s + m.spent, 0);
  const fast = scored.filter((m) => m.spent < 1);

  return {
    lowFrac: low.length / own.length, // sıkışık sürede oynanan hamle payı
    lowBlunderGap: low.length >= 3 && normal.length >= 5 ? mean(low.map(blunder)) - mean(normal.map(blunder)) : NaN,
    fastBlunder: fast.length >= 3 ? mean(fast.map(blunder)) : NaN, // <1 sn hamlelerde gaf oranı
    allocation, // + = zor pozisyonlara daha çok süre
    openingShare: open / total, // açılışa (ilk 10 hamle) harcanan süre payı
    leftover: Math.min(1, own[own.length - 1].clockAfter / (init + 40 * inc || 1)), // bitişte kalan süre
  };
}

