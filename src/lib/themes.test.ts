import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/memoryStorage';
import { DEFAULT_PREFS, loadPrefs, normalizeTheme, savePrefs } from './themes';

describe('normalizeTheme', () => {
  it('keeps current ids', () => {
    expect(normalizeTheme('bliss')).toBe('bliss');
    expect(normalizeTheme('gece')).toBe('gece');
  });

  it('maps the four pre-redesign themes to a current one', () => {
    expect(normalizeTheme('soft-dark')).toBe('gece');
    expect(normalizeTheme('dark')).toBe('gece');
    expect(normalizeTheme('light')).toBe('bliss');
    expect(normalizeTheme('soft-light')).toBe('bliss');
  });

  it('falls back to the day theme for anything else', () => {
    expect(normalizeTheme(undefined)).toBe('bliss');
    expect(normalizeTheme(42)).toBe('bliss');
  });
});

describe('loadPrefs', () => {
  beforeEach(() => { installMemoryStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns the defaults when nothing is stored', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('migrates an old stored theme and keeps the other preferences', () => {
    localStorage.setItem('yelSatranc_prefs_v1', JSON.stringify({ theme: 'soft-dark', boardColorId: 'wood', boardSize: 110 }));
    expect(loadPrefs()).toMatchObject({ theme: 'gece', boardColorId: 'wood', boardSize: 110, pieceSetId: 'default' });
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('yelSatranc_prefs_v1', '{nope');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('round-trips', () => {
    savePrefs({ ...DEFAULT_PREFS, theme: 'gece' });
    expect(loadPrefs().theme).toBe('gece');
  });
});
