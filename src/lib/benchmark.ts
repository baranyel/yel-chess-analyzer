import type { AnalyzedMove, GameSummaryStats } from './types';

export interface BenchmarkRun {
  id: string;
  gameId: string;
  engineId: string;
  engineName: string;
  depth: number;
  timestamp: number;
  moves: AnalyzedMove[];
  summary: GameSummaryStats;
  metadata: { white: string; black: string; event: string };
}

export interface ConsistencyReport {
  engineId: string;
  engineName: string;
  depth: number;
  runCount: number;
  avgEvalStdDevCp: number;
  classificationAgreementPct: number;
  acplStdDev: { white: number; black: number };
  accuracyStdDev: { white: number; black: number };
  consistencyScore: number;
}

const STORAGE_KEY = 'yelSatranc_benchmark_v1';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function computeGameId(rawInput: string): string {
  let h = 0;
  for (let i = 0; i < rawInput.length; i++) {
    h = (Math.imul(31, h) + rawInput.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function saveRun(run: Omit<BenchmarkRun, 'id'>): BenchmarkRun {
  const saved: BenchmarkRun = { ...run, id: uid() };
  const all = loadAllRuns();
  all.push(saved);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* storage full */ }
  return saved;
}

export function loadAllRuns(): BenchmarkRun[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

export function loadRunsForGame(gameId: string): BenchmarkRun[] {
  return loadAllRuns().filter((r) => r.gameId === gameId);
}

export function deleteRun(id: string): void {
  const all = loadAllRuns().filter((r) => r.id !== id);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

export function deleteAllRunsForGame(gameId: string): void {
  const all = loadAllRuns().filter((r) => r.gameId !== gameId);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

function stdDev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

function evalToCp(e: { type: 'cp' | 'mate'; value: number } | null): number {
  if (!e) return 0;
  if (e.type === 'mate') return e.value > 0 ? 10000 : -10000;
  return e.value;
}

export function computeConsistency(runs: BenchmarkRun[]): ConsistencyReport | null {
  if (runs.length < 2) return null;
  const moveCount = Math.min(...runs.map((r) => r.moves.length));
  if (moveCount === 0) return null;

  let totalEvalStdDev = 0;
  let agreements = 0;

  for (let i = 0; i < moveCount; i++) {
    const evals = runs.map((r) => evalToCp(r.moves[i].evalAfter));
    totalEvalStdDev += stdDev(evals);
    const classes = runs.map((r) => r.moves[i].classification);
    if (classes.every((c) => c === classes[0])) agreements++;
  }

  const avgEvalStdDevCp = Math.round(totalEvalStdDev / moveCount);
  const classificationAgreementPct = Math.round((agreements / moveCount) * 100);
  const evalConsistency = Math.max(0, 100 - avgEvalStdDevCp / 2);
  const consistencyScore = Math.round(classificationAgreementPct * 0.6 + evalConsistency * 0.4);

  return {
    engineId: runs[0].engineId,
    engineName: runs[0].engineName,
    depth: runs[0].depth,
    runCount: runs.length,
    avgEvalStdDevCp,
    classificationAgreementPct,
    acplStdDev: {
      white: Math.round(stdDev(runs.map((r) => r.summary.white.acpl))),
      black: Math.round(stdDev(runs.map((r) => r.summary.black.acpl))),
    },
    accuracyStdDev: {
      white: +stdDev(runs.map((r) => r.summary.white.accuracy)).toFixed(1),
      black: +stdDev(runs.map((r) => r.summary.black.accuracy)).toFixed(1),
    },
    consistencyScore,
  };
}

export function groupRunsByConfig(runs: BenchmarkRun[]): Map<string, BenchmarkRun[]> {
  const map = new Map<string, BenchmarkRun[]>();
  for (const run of runs) {
    const key = `${run.engineId}:${run.depth}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(run);
  }
  return map;
}
