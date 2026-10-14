// Chess.com herkese açık API'sinden rating bandına göre katmanlı blitz/rapid örneği.
//   node scripts/calibrate/fetch-chesscom.mjs out.jsonl [perBand=120] [maxRequests=4000]
//
// Tohum oyuncular ülke listelerinden; sonra çekilen oyunlardaki rakipler (rating'leri
// bilindiği için) eksik bantları doldurmak üzere hedefli seçilir. Yalnızca 2025-01
// ve sonrası aylar (lichess örneğiyle aynı dönem). Oyuncu başına hız başına en fazla
// 4 oyun. Yeniden başlatılabilir değil; tek seferde çalıştırın.
// Satır biçimi sample-lichess.mjs ile aynı.
import { appendFileSync, writeFileSync } from 'node:fs';

const [, , outFile, perBandArg, maxReqArg] = process.argv;
if (!outFile) throw new Error('kullanım: fetch-chesscom.mjs out.jsonl [perBand] [maxRequests]');
const PER_BAND = Number(perBandArg ?? 120);
const MAX_REQUESTS = Number(maxReqArg ?? 4000);
const BANDS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400];
const bandOf = (r) => { for (let i = BANDS.length - 1; i >= 0; i--) if (r >= BANDS[i]) return r < BANDS[i] + 200 ? i : -1; return -1; };
const SPEEDS = ['blitz', 'rapid'];
const PER_USER = 4;
const MIN_PLIES = 30;
const SINCE = '2025/01';
const COUNTRIES = ['US', 'IN', 'TR', 'DE', 'BR', 'GB', 'FR', 'ES', 'RU', 'PH', 'ID', 'PL'];
const UA = 'yel-chess-analyzer rating-calibration script (github.com, non-commercial)';

const counts = Object.fromEntries(SPEEDS.map((s) => [s, new Array(BANDS.length).fill(0)]));
const full = (s, k) => counts[s][k] >= PER_BAND;
const allFull = () => SPEEDS.every((s) => counts[s].every((c) => c >= PER_BAND));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let requests = 0;
async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    requests++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429) { await sleep(30_000); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(3000 * (attempt + 1));
    }
  }
  return null;
}

function sansOf(pgn) {
  const body = pgn.replace(/^\[.*\]\s*$/gm, '');
  return body
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

// candidates: username(lowercase) -> { name, rating: {blitz?, rapid?} }
const candidates = new Map();
const visited = new Set();
writeFileSync(outFile, '');

for (const cc of COUNTRIES) {
  const j = await get(`https://api.chess.com/pub/country/${cc}/players`);
  const list = j?.players ?? [];
  // deterministic spread through the list
  for (let i = 0; i < list.length && i < 40_000; i += Math.max(1, Math.floor(list.length / 250))) {
    candidates.set(list[i].toLowerCase(), { name: list[i], rating: {} });
  }
  await sleep(300);
}
console.error(`tohum: ${candidates.size}`);

/** Next user: one whose known rating falls in the emptiest unfilled band; else a random seed. */
function pick() {
  let best = null, bestNeed = 0;
  for (const [key, c] of candidates) {
    if (visited.has(key)) continue;
    for (const s of SPEEDS) {
      const r = c.rating[s];
      if (!r) continue;
      const k = bandOf(r);
      if (k < 0 || full(s, k)) continue;
      const need = PER_BAND - counts[s][k];
      if (need > bestNeed) { best = key; bestNeed = need; }
    }
  }
  if (best) return best;
  for (const key of candidates.keys()) if (!visited.has(key)) return key;
  return null;
}

let kept = 0;
while (!allFull() && requests < MAX_REQUESTS) {
  const key = pick();
  if (!key) break;
  visited.add(key);
  const name = candidates.get(key).name;
  const arch = await get(`https://api.chess.com/pub/player/${encodeURIComponent(name)}/games/archives`);
  const months = (arch?.archives ?? []).filter((u) => u.slice(-7) >= SINCE).slice(-2).reverse();
  for (const m of months) {
    const j = await get(m);
    await sleep(250);
    const taken = { blitz: 0, rapid: 0 };
    for (const g of [...(j?.games ?? [])].reverse()) {
      const s = g.time_class;
      // remember opponents (and their rating) as future candidates
      for (const side of [g.white, g.black]) {
        const k2 = side?.username?.toLowerCase();
        if (!k2 || !SPEEDS.includes(s)) continue;
        const c = candidates.get(k2) ?? { name: side.username, rating: {} };
        c.rating[s] = side.rating;
        candidates.set(k2, c);
      }
      if (!SPEEDS.includes(s) || !g.rated || g.rules !== 'chess' || !g.pgn || taken[s] >= PER_USER) continue;
      const we = g.white.rating, be = g.black.rating;
      if (!we || !be || Math.abs(we - be) > 300) continue;
      if (/abandoned/.test(g.white.result + g.black.result)) continue;
      const k = bandOf((we + be) / 2);
      if (k < 0 || full(s, k)) continue;
      const sans = sansOf(g.pgn);
      if (sans.length < MIN_PLIES) continue;
      const [base, inc] = String(g.time_control).split('+').map(Number);
      appendFileSync(outFile, JSON.stringify({ site: 'chesscom', speed: s, base, inc: inc || 0, whiteElo: we, blackElo: be, sans }) + '\n');
      counts[s][k]++; taken[s]++; kept++;
    }
  }
  if (visited.size % 25 === 0) {
    console.error(`istek ${requests}, oyuncu ${visited.size}, oyun ${kept}`);
    for (const s of SPEEDS) console.error(' ', s, BANDS.map((b, i) => `${b}:${counts[s][i]}`).join(' '));
  }
  await sleep(250);
}
console.error(`bitti: istek ${requests}, oyun ${kept}`);
for (const s of SPEEDS) console.error(' ', s, BANDS.map((b, i) => `${b}:${counts[s][i]}`).join(' '));
