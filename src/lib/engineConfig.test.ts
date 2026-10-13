import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultWorkerCount, effectiveHashMb, logicalCores, workerOptions } from './engineConfig';

afterEach(() => { vi.unstubAllGlobals(); });

const cores = (n: number | undefined) => vi.stubGlobal('navigator', { hardwareConcurrency: n });

describe('effectiveHashMb', () => {
  it('splits a 512 MB total budget across the workers', () => {
    expect(effectiveHashMb(1, 64)).toBe(64);
    expect(effectiveHashMb(1, 1024)).toBe(512);   // 1 GB request is capped
    expect(effectiveHashMb(4, 256)).toBe(128);
    expect(effectiveHashMb(16, 512)).toBe(32);
  });

  it('never goes below 16 MB per worker', () => {
    expect(effectiveHashMb(64, 512)).toBe(16);
  });
});

describe('defaultWorkerCount', () => {
  it('uses half the cores, between 1 and 4', () => {
    cores(2); expect(defaultWorkerCount()).toBe(1);
    cores(8); expect(defaultWorkerCount()).toBe(4);
    cores(32); expect(defaultWorkerCount()).toBe(4);
    cores(6); expect(defaultWorkerCount()).toBe(3);
  });

  it('falls back to 1 when the core count is unknown or 1', () => {
    cores(undefined); expect(defaultWorkerCount()).toBe(1);
    cores(1); expect(defaultWorkerCount()).toBe(1);
  });
});

describe('workerOptions', () => {
  it('offers only counts the machine can run, always including 1 and the current value', () => {
    cores(4);
    expect(logicalCores()).toBe(4);
    expect(workerOptions(2)).toEqual([1, 2, 4]);
    expect(workerOptions(12)).toEqual([1, 2, 4, 12]);   // a previously chosen value is not lost
  });

  it('assumes 4 cores when unknown', () => {
    cores(undefined);
    expect(workerOptions(1)).toEqual([1, 2, 4]);
  });
});
