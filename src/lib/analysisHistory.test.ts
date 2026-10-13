import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage, type MemoryStorage } from '../test/memoryStorage';
import { makeRecord } from '../test/fixtures';
import {
  hasAnalysisRecord,
  loadAnalysisRecord,
  loadHistoryIndex,
  saveAnalysisRecord,
} from './analysisHistory';

let storage: MemoryStorage;

beforeEach(() => { storage = installMemoryStorage(); });
afterEach(() => { vi.unstubAllGlobals(); });

const recordKeys = () =>
  Array.from({ length: storage.length }, (_, i) => storage.key(i)!).filter((k) => k.startsWith('yelSatranc_h2r_'));

describe('analysis history', () => {
  it('round-trips a record, rebuilding the derived fields', () => {
    const rec = makeRecord('g1', { plies: 6 });
    expect(saveAnalysisRecord(rec)).toEqual({ ok: true });

    const loaded = loadAnalysisRecord('g1')!;
    expect(loaded.moves).toEqual(rec.moves);          // incl. fenBefore / fenAfter
    expect(loaded.fens).toEqual(rec.fens);
    expect(loaded.sanMoves).toEqual(rec.sanMoves);
    expect(loaded.summary).toEqual(rec.summary);
    expect(loaded.pgn).toBe(rec.pgn);
    expect(loaded.metadata).toEqual(rec.metadata);
  });

  it('does not store data that can be derived', () => {
    saveAnalysisRecord(makeRecord('g1', { plies: 40 }));
    const raw = storage.getItem('yelSatranc_h2r_g1')!;
    expect(raw).not.toContain('fenBefore');
    expect(raw).not.toContain('sanMoves');
    expect(raw).not.toContain('"summary"');
    expect(raw.length).toBeLessThan(JSON.stringify(makeRecord('g1', { plies: 40 })).length * 0.7);
  });

  it('answers "is it analysed?" from the index alone', () => {
    saveAnalysisRecord(makeRecord('a', { depth: 12 }));
    saveAnalysisRecord(makeRecord('b', { depth: 20 }));

    expect(hasAnalysisRecord('a')).toBe(true);
    expect(hasAnalysisRecord('zzz')).toBe(false);
    const index = loadHistoryIndex();
    expect(index.get('a')).toMatchObject({ depth: 12, engineId: 'stockfish-18' });
    expect([...index.keys()]).toEqual(['b', 'a']);      // newest first
  });

  it('keeps the names, result and length in the index for the recent-analyses list', () => {
    saveAnalysisRecord(makeRecord('a', { plies: 6 }));
    expect(loadHistoryIndex().get('a')).toMatchObject({ white: 'a', black: 'b', plies: 6 });
  });

  it('replaces a record with the same id instead of duplicating it', () => {
    saveAnalysisRecord(makeRecord('a', { depth: 10 }));
    saveAnalysisRecord(makeRecord('a', { depth: 22 }));
    expect(loadHistoryIndex().size).toBe(1);
    expect(loadAnalysisRecord('a')!.depth).toBe(22);
  });

  it('keeps at most 50 records and deletes the evicted ones', () => {
    for (let i = 0; i < 55; i++) saveAnalysisRecord(makeRecord(`g${i}`, { plies: 4 }));
    const index = loadHistoryIndex();
    expect(index.size).toBe(50);
    expect(index.has('g0')).toBe(false);
    expect(index.has('g54')).toBe(true);
    expect(recordKeys()).toHaveLength(50);              // no orphans left behind
  });

  it('evicts the oldest records when the browser quota is hit, instead of losing the new one', () => {
    const one = JSON.stringify(makeRecord('x', { plies: 40 })).length;
    vi.unstubAllGlobals();
    storage = installMemoryStorage(Math.floor(one * 2.4)); // room for ~2 records

    for (let i = 0; i < 6; i++) expect(saveAnalysisRecord(makeRecord(`g${i}`, { plies: 40 })).ok).toBe(true);

    const index = loadHistoryIndex();
    expect(index.has('g5')).toBe(true);                 // newest survived
    expect(index.has('g0')).toBe(false);                // oldest was evicted
    expect(index.size).toBeLessThanOrEqual(3);
    expect([...index.keys()].sort()).toEqual(recordKeys().map((k) => k.replace('yelSatranc_h2r_', '')).sort());
  });

  it('reports failure (and leaves no orphan) when a record can never fit', () => {
    vi.unstubAllGlobals();
    storage = installMemoryStorage(200);

    const result = saveAnalysisRecord(makeRecord('big', { plies: 40 }));
    expect(result).toEqual({ ok: false, reason: 'quota' });
    expect(recordKeys()).toHaveLength(0);
    expect(hasAnalysisRecord('big')).toBe(false);
  });

  it('forgets a corrupt record instead of showing it as analysed forever', () => {
    saveAnalysisRecord(makeRecord('a', { plies: 4 }));
    storage.setItem('yelSatranc_h2r_a', '{not json');

    expect(loadAnalysisRecord('a')).toBeNull();
    expect(hasAnalysisRecord('a')).toBe(false);
    expect(storage.getItem('yelSatranc_h2r_a')).toBeNull();
  });
});

describe('v1 → v2 migration', () => {
  function legacyRecord(id: string, analyzedAt: number) {
    const rec = makeRecord(id, { plies: 4, analyzedAt });
    // v1 shape: fat moves with bestEval / secondBestCpLoss and an unclamped cpLoss.
    const moves = rec.moves.map((m) => ({
      ...m,
      evalBefore: { type: 'mate' as const, value: 3 },
      evalAfter: { type: 'cp' as const, value: 500 },
      cpLoss: 9500,
      bestEval: m.evalBefore,
      secondBestCpLoss: 9999,
    }));
    return { ...rec, moves, summary: { ...rec.summary, white: { ...rec.summary.white, acpl: 9500 } } };
  }

  it('moves old records over, recomputes cpLoss and removes the v1 key', () => {
    // v1 stored newest first
    storage.setItem('yelSatranc_history_v1', JSON.stringify([legacyRecord('new', 2000), legacyRecord('old', 1000)]));

    const index = loadHistoryIndex();
    expect([...index.keys()]).toEqual(['new', 'old']);
    expect(storage.getItem('yelSatranc_history_v1')).toBeNull();

    const loaded = loadAnalysisRecord('new')!;
    expect(loaded.moves[0]!.cpLoss).toBe(500);                 // 1000 (clamped mate) − 500, not 9500
    expect(loaded.summary.white.acpl).toBe(500);               // summary derived, not the stale 9500
    expect(loaded.analyzedAt).toBe(2000);
    expect(storage.getItem('yelSatranc_h2r_new')).not.toContain('bestEval');
  });

  it('silently drops an unreadable v1 blob', () => {
    storage.setItem('yelSatranc_history_v1', 'garbage');
    expect(loadHistoryIndex().size).toBe(0);
    expect(storage.getItem('yelSatranc_history_v1')).toBeNull();
  });
});
