import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STICKER,
  alphaOf,
  boxBlur,
  dilate,
  dotRadius,
  halftone,
  makeStickerPixels,
  shadeFromAlpha,
  type Pixels,
} from './sticker';

const fill = (w: number, h: number, v: number) => new Float32Array(w * h).fill(v);
const coverage = (m: Uint8Array) => m.reduce((s, v) => s + v, 0) / m.length;

describe('dotRadius', () => {
  it('is zero for no ink and reaches the cell corners for solid ink', () => {
    expect(dotRadius(0, 10)).toBe(0);
    expect(dotRadius(1, 10)).toBeCloseTo(10 * Math.SQRT1_2, 5);
  });

  it('grows monotonically with coverage', () => {
    let prev = -1;
    for (let f = 0; f <= 1; f += 0.05) {
      const r = dotRadius(f, 8);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});

describe('halftone', () => {
  const w = 96, h = 96;

  it('puts no ink on paper and covers solid areas', () => {
    expect(coverage(halftone(fill(w, h, 0), w, h, 8, 45))).toBe(0);
    expect(coverage(halftone(fill(w, h, 1), w, h, 8, 45))).toBeGreaterThan(0.97);
  });

  it('ink coverage tracks darkness', () => {
    const mid = coverage(halftone(fill(w, h, 0.5), w, h, 8, 45));
    const dark = coverage(halftone(fill(w, h, 0.8), w, h, 8, 45));
    const light = coverage(halftone(fill(w, h, 0.2), w, h, 8, 45));
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.62);
    expect(light).toBeLessThan(mid);
    expect(dark).toBeGreaterThan(mid);
  });
});

describe('dilate', () => {
  it('grows a single pixel into a disk and stays inside the image', () => {
    const w = 21, h = 21;
    const m = new Uint8Array(w * h);
    m[10 * w + 10] = 1;
    const d = dilate(m, w, h, 4);
    const area = d.reduce((s, v) => s + v, 0);
    expect(area).toBeGreaterThan(Math.PI * 16 * 0.85);
    expect(area).toBeLessThan(Math.PI * 16 * 1.25);
    expect(d[10 * w + 14]).toBe(1);
    expect(d[10 * w + 15]).toBe(0);
  });

  it('does not wrap around the edges', () => {
    const w = 10, h = 10;
    const m = new Uint8Array(w * h);
    m[0] = 1;
    const d = dilate(m, w, h, 3);
    expect(d[w - 1]).toBe(0);
    expect(d[(h - 1) * w]).toBe(0);
  });
});

describe('boxBlur / shade', () => {
  it('preserves a constant image', () => {
    const b = boxBlur(fill(10, 10, 0.4), 10, 10, 3);
    expect(Math.max(...b)).toBeCloseTo(0.4, 5);
    expect(Math.min(...b)).toBeCloseTo(0.4, 5);
  });

  it('lights the top-left of a disc more than its bottom-right', () => {
    const w = 80, h = 80;
    const alpha = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 40, y - 40) < 28) alpha[y * w + x] = 1;
    const shade = shadeFromAlpha(alpha, w, h, 4);
    const topLeft = shade[26 * w + 26]!;
    const bottomRight = shade[54 * w + 54]!;
    expect(topLeft).toBeGreaterThan(bottomRight);
  });
});

describe('makeStickerPixels', () => {
  // a 40×40 canvas with a solid black 14×14 square in the middle, 13 px of padding
  const w = 40, h = 40;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 13; y < 27; y++) for (let x = 13; x < 27; x++) data.set([0, 0, 0, 255], (y * w + x) * 4);
  const src: Pixels = { width: w, height: h, data };
  const opts = { ...DEFAULT_STICKER, size: 14, cell: 4, border: 5, ring: 0 };

  it('keeps the silhouette, adds a white die-cut border and leaves the outside transparent', () => {
    const out = makeStickerPixels(src, opts);
    const px = (x: number, y: number) => Array.from(out.data.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
    expect(alphaOf(out)[20 * w + 20]).toBe(1);        // body stays opaque
    expect(px(10, 20)).toEqual([255, 255, 255, 255]); // 3 px outside the body → paper border
    expect(px(1, 1)[3]).toBe(0);                      // far corner → transparent
  });

  it('draws the hot ring outside the paper border when asked', () => {
    const out = makeStickerPixels(src, { ...opts, border: 4, ring: 3 });
    const px = (x: number, y: number) => Array.from(out.data.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
    expect(px(10, 20)).toEqual([255, 255, 255, 255]); // inside the border (3 px from body)
    expect(px(7, 20)).toEqual([196, 22, 28, 255]);    // 6 px from body → ring
    expect(px(3, 20)[3]).toBe(0);                      // beyond the ring
  });

  it('only uses ink and paper colours inside the body (a real halftone, no greys)', () => {
    const out = makeStickerPixels(src, opts);
    const colours = new Set<string>();
    for (let y = 13; y < 27; y++) for (let x = 13; x < 27; x++) colours.add(Array.from(out.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3)).join(','));
    for (const c of colours) expect(['17,20,24', '255,255,255']).toContain(c);
  });
});
