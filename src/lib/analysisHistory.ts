import { computeGameId } from './benchmark';
import type { AnalyzedMove, GameSummaryStats, PgnMetadata } from './types';

export interface AnalysisRecord {
  gameId: string;       // computeGameId(pgn) — primary key
  pgn: string;          // original PGN (for benchmark saving after restore)
  analyzedAt: number;
  depth: number;
  engineId: string;
  moves: AnalyzedMove[];
  summary: GameSummaryStats;
  fens: string[];
  sanMoves: string[];
  metadata: PgnMetadata;
}

const STORAGE_KEY = 'yelSatranc_history_v1';
const MAX_RECORDS = 50;

function loadAll(): AnalysisRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

function saveAll(records: AnalysisRecord[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* storage full */ }
}

export function saveAnalysisRecord(record: AnalysisRecord): void {
  const all = loadAll().filter((r) => r.gameId !== record.gameId); // overwrite existing
  all.unshift(record); // newest first
  saveAll(all.slice(0, MAX_RECORDS));
}

export function loadAnalysisRecord(gameId: string): AnalysisRecord | null {
  return loadAll().find((r) => r.gameId === gameId) ?? null;
}

export function hasAnalysisRecord(gameId: string): boolean {
  return loadAll().some((r) => r.gameId === gameId);
}

export { computeGameId };
