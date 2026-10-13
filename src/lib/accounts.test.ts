import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/memoryStorage';
import {
  chesscomTimeControlLabel,
  fetchChessComGames,
  fetchLichessGames,
  mapChessComGame,
  mapLichessGame,
  speedLabel,
} from './accounts';

describe('time control labels', () => {
  it('maps Lichess speeds / Chess.com time classes directly', () => {
    expect(speedLabel('ultraBullet')).toBe('Bullet');
    expect(speedLabel('blitz')).toBe('Blitz');
    expect(speedLabel('classical')).toBe('Klasik');
    expect(speedLabel('daily')).toBe('Günlük');
    expect(speedLabel(undefined)).toBeUndefined();
  });

  it('does not label a Chess.com daily game ("1/86400") as Bullet', () => {
    expect(chesscomTimeControlLabel('1/86400')).toBe('Günlük');
  });

  it('classifies plain Chess.com time_control strings', () => {
    expect(chesscomTimeControlLabel('60')).toBe('Bullet');
    expect(chesscomTimeControlLabel('180+2')).toBe('Blitz');
    expect(chesscomTimeControlLabel('900+10')).toBe('Rapid');
    expect(chesscomTimeControlLabel('1800')).toBe('Klasik');
  });
});

describe('mapLichessGame', () => {
  const base = {
    id: 'abc',
    pgn: '1. e4 e5 *',
    speed: 'blitz',
    winner: 'white' as const,
    players: { white: { user: { name: 'Ann' }, rating: 1500 }, black: { user: { name: 'Bob' }, rating: 1480 } },
  };

  it('maps a standard game', () => {
    expect(mapLichessGame(base)).toMatchObject({
      id: 'abc', platform: 'lichess', white: 'Ann', black: 'Bob', result: '1-0', timeControl: 'Blitz',
    });
  });

  it('drops variants and games without a PGN', () => {
    expect(mapLichessGame({ ...base, variant: 'chess960' })).toBeNull();
    expect(mapLichessGame({ ...base, variant: 'atomic' })).toBeNull();
    expect(mapLichessGame({ ...base, pgn: undefined })).toBeNull();
    expect(mapLichessGame({ ...base, variant: 'fromPosition' })).not.toBeNull();
  });
});

describe('mapChessComGame', () => {
  const base = {
    uuid: 'u1',
    pgn: '1. e4 e5 *',
    rules: 'chess',
    time_class: 'daily',
    time_control: '1/86400',
    white: { username: 'ann', rating: 1500, result: 'win' },
    black: { username: 'bob', rating: 1480, result: 'resigned' },
  };

  it('maps result and uses time_class for the label', () => {
    expect(mapChessComGame(base)).toMatchObject({ result: '1-0', timeControl: 'Günlük' });
    expect(mapChessComGame({ ...base, white: { ...base.white, result: 'checkmated' }, black: { ...base.black, result: 'win' } }))
      .toMatchObject({ result: '0-1' });
  });

  it('drops non-standard rules', () => {
    expect(mapChessComGame({ ...base, rules: 'chess960' })).toBeNull();
    expect(mapChessComGame({ ...base, rules: 'bughouse' })).toBeNull();
  });
});

describe('fetching', () => {
  beforeEach(() => { installMemoryStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const lichessLine = JSON.stringify({ id: 'g1', pgn: '1. e4 *', speed: 'rapid', winner: 'black', players: {} });

  function stubFetchText(body: string) {
    const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => body });
    vi.stubGlobal('fetch', fn);
    return fn;
  }

  it('Lichess: only requests standard-rules perf types and caches per game count', async () => {
    const fetchFn = stubFetchText(lichessLine);
    const first = await fetchLichessGames('Ann', 15);
    expect(first).toHaveLength(1);
    const url = String(fetchFn.mock.calls[0]![0]);
    expect(url).toContain('perfType=ultraBullet,bullet,blitz,rapid,classical,correspondence');
    expect(url).toContain('max=15');

    await fetchLichessGames('Ann', 15);            // cache hit
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await fetchLichessGames('Ann', 30);            // different count => different cache entry
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('Lichess: force=true bypasses the cache', async () => {
    const fetchFn = stubFetchText(lichessLine);
    await fetchLichessGames('Ann', 15);
    await fetchLichessGames('Ann', 15, true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('Lichess: turns HTTP errors into readable messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' }));
    await expect(fetchLichessGames('nobody')).rejects.toThrow('Kullanıcı bulunamadı.');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => '' }));
    await expect(fetchLichessGames('busy')).rejects.toThrow(/Çok fazla istek/);
  });

  it('Chess.com: sends no custom headers (avoids a CORS preflight)', async () => {
    const monthUrl = 'https://api.chess.com/pub/player/ann/games/2026/10';
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ archives: [monthUrl] }) })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          games: [
            { uuid: 'a', pgn: '1. e4 *', rules: 'chess', time_class: 'blitz',
              white: { username: 'ann', result: 'win' }, black: { username: 'bob', result: 'resigned' } },
            { uuid: 'b', pgn: '1. e4 *', rules: 'chess960', time_class: 'blitz',
              white: { username: 'ann', result: 'win' }, black: { username: 'bob', result: 'resigned' } },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchFn);

    const games = await fetchChessComGames('ann', 15);
    expect(games.map((g) => g.id)).toEqual(['a']);          // chess960 dropped
    for (const call of fetchFn.mock.calls) expect(call).toHaveLength(1); // URL only, no init/headers
  });
});
