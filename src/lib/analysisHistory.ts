import { computeGameId } from './benchmark';
import { computeCpLoss } from './classification';
import { parseClockInfo } from './pgn';
import { buildSummary } from './summary';
import type { AnalyzedMove, GameSummaryStats, PgnMetadata } from './types';

/** A saved analysis, fully hydrated (what the rest of the app works with). */
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

/** What the game list needs to know without loading any record. */
export interface HistoryIndexEntry {
  gameId: string;
  depth: number;
  engineId: string;
  analyzedAt: number;
  // Shown in the "recent analyses" list. Absent on entries written before they existed.
  white?: string;
  black?: string;
  result?: string;
  plies?: number;
}

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' };

// ── Storage layout ────────────────────────────────────────────────────────
// One key per record + one small index. Reading "is this game analysed?" only
// parses the index, never the (large) records.
const INDEX_KEY = 'yelSatranc_h2_index';
const RECORD_PREFIX = 'yelSatranc_h2r_';
const LEGACY_KEY = 'yelSatranc_history_v1';
const MAX_RECORDS = 50;
const MAX_EVICTIONS_PER_SAVE = 10;

const recordKey = (gameId: string) => RECORD_PREFIX + gameId;

// Stored moves leave out everything that can be derived: the FENs (they are
// `fens[i]` / `fens[i+1]`), the SAN list, and the summary.
type StoredMove = Omit<AnalyzedMove, 'fenBefore' | 'fenAfter'>;

interface StoredRecord {
  gameId: string;
  pgn: string;
  analyzedAt: number;
  depth: number;
  engineId: string;
  fens: string[];
  moves: StoredMove[];
  metadata: PgnMetadata;
}

function toStoredMove(m: AnalyzedMove): StoredMove {
  return {
    moveNumber: m.moveNumber,
    color: m.color,
    san: m.san,
    uci: m.uci,
    evalBefore: m.evalBefore,
    evalAfter: m.evalAfter,
    bestMove: m.bestMove,
    alternatives: m.alternatives,
    alternativeEvals: m.alternativeEvals,
    classification: m.classification,
    cpLoss: m.cpLoss,
    ...(m.commentary ? { commentary: m.commentary } : {}),
  };
}

function toStored(r: AnalysisRecord): StoredRecord {
  return {
    gameId: r.gameId,
    pgn: r.pgn,
    analyzedAt: r.analyzedAt,
    depth: r.depth,
    engineId: r.engineId,
    fens: r.fens,
    moves: r.moves.map(toStoredMove),
    metadata: r.metadata,
  };
}

function hydrate(s: StoredRecord): AnalysisRecord {
  const moves: AnalyzedMove[] = s.moves.map((m, i) => ({
    ...m,
    fenBefore: s.fens[i] ?? '',
    fenAfter: s.fens[i + 1] ?? '',
  }));
  return {
    gameId: s.gameId,
    pgn: s.pgn,
    analyzedAt: s.analyzedAt,
    depth: s.depth,
    engineId: s.engineId,
    moves,
    summary: buildSummary(moves, { metadata: s.metadata, clockInfo: parseClockInfo(s.pgn, moves.length) }),
    fens: s.fens,
    sanMoves: moves.map((m) => m.san),
    metadata: s.metadata,
  };
}

// ── Low-level helpers ─────────────────────────────────────────────────────

function trySet(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function tryRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function readIndex(): HistoryIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryIndexEntry[]) : [];
  } catch { return []; }
}

function writeIndex(entries: HistoryIndexEntry[]): boolean {
  return trySet(INDEX_KEY, JSON.stringify(entries));
}

/** Drops the oldest record (index is newest-first). */
function evictOldest(index: HistoryIndexEntry[]): void {
  const oldest = index.pop();
  if (oldest) tryRemove(recordKey(oldest.gameId));
}

// ── v1 → v2 migration ─────────────────────────────────────────────────────
// v1 kept every record (with duplicated FENs) in one array under one key, and its
// cpLoss values were computed without the ±1000 clamp. Move the records over and
// recompute cpLoss; the summary is derived on load.

interface LegacyRecord {
  gameId: string;
  pgn: string;
  analyzedAt: number;
  depth: number;
  engineId: string;
  moves: AnalyzedMove[];
  fens: string[];
  sanMoves: string[];
  metadata: PgnMetadata;
}

function migrateLegacyHistory(): void {
  let raw: string | null;
  try { raw = localStorage.getItem(LEGACY_KEY); } catch { return; }
  if (raw === null) return;

  // Remove first: it frees space for the new records and prevents re-entry.
  tryRemove(LEGACY_KEY);

  let legacy: LegacyRecord[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    legacy = parsed as LegacyRecord[];
  } catch { return; }

  // v1 was newest-first; insert oldest first so the newest ends up in front.
  for (const r of [...legacy].reverse()) {
    try {
      const moves = r.moves.map((m) => ({
        ...m,
        cpLoss: m.evalBefore && m.evalAfter ? computeCpLoss(m.evalBefore, m.evalAfter, m.color) : m.cpLoss,
      }));
      saveAnalysisRecord({ ...r, moves, summary: buildSummary(moves) });
    } catch { /* skip a corrupt record */ }
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Saves (or replaces) a record. When the browser quota is hit the oldest
 * records are evicted until it fits; if even an empty history cannot hold it,
 * `{ ok: false }` is returned and nothing is lost silently.
 */
export function saveAnalysisRecord(record: AnalysisRecord): SaveResult {
  migrateLegacyHistory();

  const previous = readIndex();
  const replaced = previous.find((e) => e.gameId === record.gameId);
  const others = previous.filter((e) => e.gameId !== record.gameId);
  while (others.length >= MAX_RECORDS) evictOldest(others);

  const key = recordKey(record.gameId);
  const payload = JSON.stringify(toStored(record));
  const entry: HistoryIndexEntry = {
    gameId: record.gameId,
    depth: record.depth,
    engineId: record.engineId,
    analyzedAt: record.analyzedAt,
    white: record.metadata.white,
    black: record.metadata.black,
    result: record.metadata.result,
    plies: record.moves.length,
  };

  let evicted = 0;
  for (;;) {
    if (trySet(key, payload)) {
      if (writeIndex([entry, ...others])) return { ok: true };
      tryRemove(key); // keep records and index consistent
    }
    // Making room costs the user old analyses, so only do it a few times: if the
    // record still does not fit, something else is filling the storage.
    if (others.length === 0 || evicted >= MAX_EVICTIONS_PER_SAVE) {
      writeIndex(replaced ? [replaced, ...others] : others);
      return { ok: false, reason: 'quota' };
    }
    evictOldest(others);
    evicted++;
  }
}

export function loadAnalysisRecord(gameId: string): AnalysisRecord | null {
  migrateLegacyHistory();
  try {
    const raw = localStorage.getItem(recordKey(gameId));
    if (raw) return hydrate(JSON.parse(raw) as StoredRecord);
  } catch { /* corrupt — handled below */ }

  // Missing or corrupt record: forget it so it stops showing up as "analysed".
  tryRemove(recordKey(gameId));
  const index = readIndex();
  if (index.some((e) => e.gameId === gameId)) writeIndex(index.filter((e) => e.gameId !== gameId));
  return null;
}

/** One cheap read of the small index; use this instead of per-game lookups while rendering. */
export function loadHistoryIndex(): Map<string, HistoryIndexEntry> {
  migrateLegacyHistory();
  return new Map(readIndex().map((e) => [e.gameId, e]));
}

export function hasAnalysisRecord(gameId: string): boolean {
  return loadHistoryIndex().has(gameId);
}

export { computeGameId };
