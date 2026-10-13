import { vi } from 'vitest';

/** Minimal in-memory `localStorage` for node tests, with an optional size quota. */
export class MemoryStorage {
  private map = new Map<string, string>();
  private maxChars: number;

  constructor(maxChars = Infinity) {
    this.maxChars = maxChars;
  }

  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }

  setItem(key: string, value: string): void {
    const next = new Map(this.map).set(key, String(value));
    let total = 0;
    for (const [k, v] of next) total += k.length + v.length;
    if (total > this.maxChars) {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map = next;
  }

  /** Total characters currently stored (keys + values). */
  usedChars(): number {
    let total = 0;
    for (const [k, v] of this.map) total += k.length + v.length;
    return total;
  }
}

export function installMemoryStorage(maxChars = Infinity): MemoryStorage {
  const storage = new MemoryStorage(maxChars);
  vi.stubGlobal('localStorage', storage);
  return storage;
}
