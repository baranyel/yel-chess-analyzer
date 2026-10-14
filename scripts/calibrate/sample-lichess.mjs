// Lichess dump'ından (stdin, PGN) rating bandına göre katmanlı blitz/rapid örneği.
// Motor değerlendirmesi gerekmez; evaluate.mjs her iki site için aynı motorla analiz eder.
//
//   zstd -dc part.zst | node scripts/calibrate/sample-lichess.mjs [perBand=120] > lichess-sample.jsonl
//
// Satır: { site, speed, base, inc, whiteElo, blackElo, sans: [...] }
import { createInterface } from 'node:readline';

const PER_BAND = Number(process.argv[2] ?? 120);
const BANDS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400]; // alt sınırlar, 200'lük
const bandOf = (r) => { for (let i = BANDS.length - 1; i >= 0; i--) if (r >= BANDS[i]) return r < BANDS[i] + 200 ? i : -1; return -1; };
const SPEED = { 'Rated Blitz game': 'blitz', 'Rated Rapid game': 'rapid' };
const MIN_PLIES = 30;

const counts = { blitz: new Array(BANDS.length).fill(0), rapid: new Array(BANDS.length).fill(0) };
let headers = {}, buf = '', inMoves = false, kept = 0;

function flush() {
  const speed = SPEED[headers.Event];
  if (!speed || headers.Variant || headers.Termination === 'Abandoned') return;
  const we = Number(headers.WhiteElo), be = Number(headers.BlackElo);
  if (!we || !be || Math.abs(we - be) > 300) return;
  const k = bandOf((we + be) / 2);
  if (k < 0 || counts[speed][k] >= PER_BAND) return;
  const sans = buf
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  if (sans.length < MIN_PLIES) return;
  const [base, inc] = (headers.TimeControl ?? '0+0').split('+').map(Number);
  counts[speed][k]++;
  kept++;
  process.stdout.write(JSON.stringify({ site: 'lichess', speed, base, inc, whiteElo: we, blackElo: be, sans }) + '\n');
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (line.startsWith('[')) {
    if (inMoves) { flush(); headers = {}; buf = ''; inMoves = false; }
    const m = /^\[(\w+) "(.*)"\]$/.exec(line);
    if (m) headers[m[1]] = m[2];
  } else if (line.trim()) { inMoves = true; buf += line + ' '; }
});
rl.on('close', () => {
  if (inMoves) flush();
  console.error(`alınan: ${kept}`);
  for (const s of ['blitz', 'rapid']) console.error(s, BANDS.map((b, i) => `${b}:${counts[s][i]}`).join(' '));
});
