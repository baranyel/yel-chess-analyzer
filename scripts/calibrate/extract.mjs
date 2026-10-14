// Lichess veritabanı PGN akışından (stdin) analizli oyunları JSONL olarak çıkarır.
//
//   curl -s -r 0-120000000 https://database.lichess.org/standard/lichess_db_standard_rated_2025-01.pgn.zst \
//     | zstd -dc 2>/dev/null | node scripts/calibrate/extract.mjs > games.jsonl
//
// Sadece her hamlesi için [%eval] içeren, dereceli blitz/rapid/klasik oyunlar
// alınır. Eval değerleri beyazın bakış açısındandır: { cp } veya { mate }.
import { createInterface } from 'node:readline';

const KEEP_EVENTS = /Rated (Blitz|Rapid|Classical) game/;
const MIN_PLIES = 20;

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

let headers = {};
let kept = 0;
let seen = 0;

function parseMoves(text) {
  const plies = [];
  // "12. Nf3 { [%eval 0.3] [%clk 0:01:00] } 12... e5 { ... }"
  const re = /(?:\d+\.{1,3}\s*)?([A-Za-z][^\s{}]*)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const ev = /\[%eval ([^\]]+)\]/.exec(m[2]);
    if (!ev) {
      plies.push({ san: m[1], eval: null });
      continue;
    }
    const raw = ev[1];
    plies.push({
      san: m[1],
      eval: raw.startsWith('#') ? { mate: Number(raw.slice(1)) } : { cp: Math.round(Number(raw) * 100) },
    });
  }
  return plies;
}

function flush(moveText) {
  seen++;
  if (!KEEP_EVENTS.test(headers.Event ?? '')) return;
  const we = Number(headers.WhiteElo);
  const be = Number(headers.BlackElo);
  if (!we || !be || headers.WhiteElo?.includes('?') || headers.BlackElo?.includes('?')) return;
  if (!moveText.includes('[%eval')) return;
  const plies = parseMoves(moveText);
  if (plies.length < MIN_PLIES) return;
  // Lichess son hamlede (mat/teslim) eval yazmayabilir; en fazla sondaki 1 eksiğe izin ver.
  const missing = plies.filter((p) => p.eval === null).length;
  if (missing > 1 || plies[0].eval === null) return;
  const last = plies[plies.length - 1];
  if (last.eval === null) last.eval = plies[plies.length - 2].eval;

  const [base, inc] = (headers.TimeControl ?? '0+0').split('+').map(Number);
  process.stdout.write(
    JSON.stringify({
      id: (headers.Site ?? '').split('/').pop(),
      white: headers.White,
      black: headers.Black,
      whiteElo: we,
      blackElo: be,
      base,
      inc,
      event: headers.Event.replace(/^Rated | game$/g, '').toLowerCase(),
      result: headers.Result,
      plies,
    }) + '\n',
  );
  kept++;
}

let inMoves = false;
let buf = '';
rl.on('line', (line) => {
  if (line.startsWith('[')) {
    if (inMoves) {
      // yeni oyun başlıyor, önceki bitti
      flush(buf);
      headers = {};
      buf = '';
      inMoves = false;
    }
    const m = /^\[(\w+) "(.*)"\]$/.exec(line);
    if (m) headers[m[1]] = m[2];
  } else if (line.trim()) {
    inMoves = true;
    buf += line + ' ';
  }
});
rl.on('close', () => {
  if (inMoves) flush(buf);
  console.error(`oyun: ${seen}, alınan: ${kept}`);
});
