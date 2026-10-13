// Turns a flat piece drawing into a die-cut halftone sticker:
//   1. shade   – fake a 3-D tone from the silhouette (blurred alpha as a height map)
//   2. halftone – rotated dot screen: darker tone = bigger black dot
//   3. die-cut – white paper border around the silhouette, optional hot-colour ring
//
// Everything except `renderSticker` is a pure function over typed arrays, so it is
// unit-tested without a browser. Nothing is downloaded: the source is a piece SVG we ship.

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, row-major, like ImageData.data */
  data: Uint8ClampedArray;
}

export interface StickerOptions {
  /** Edge length (px) of the square the piece is drawn into, before padding. */
  size: number;
  /** Halftone cell size in px. */
  cell: number;
  /** Dot-screen angle in degrees. */
  angle: number;
  /** Width of the white paper border in px. */
  border: number;
  /** Optional second ring outside the border (px, 0 = none). */
  ring: number;
  ringColor: string;
  inkColor: string;
  paperColor: string;
}

export const DEFAULT_STICKER: StickerOptions = {
  size: 360,
  cell: 7,
  angle: 45,
  border: 9,
  ring: 0,
  ringColor: '#c4161c',
  inkColor: '#111418',
  paperColor: '#ffffff',
};

// ── Pure pixel helpers ────────────────────────────────────────────────────

/** Alpha channel as 0–1 floats. */
export function alphaOf(p: Pixels): Float32Array {
  const out = new Float32Array(p.width * p.height);
  for (let i = 0; i < out.length; i++) out[i] = p.data[i * 4 + 3]! / 255;
  return out;
}

/** 0 (white) … 1 (black) darkness of the drawing itself, ignoring transparent pixels. */
export function darknessOf(p: Pixels): Float32Array {
  const out = new Float32Array(p.width * p.height);
  for (let i = 0; i < out.length; i++) {
    const r = p.data[i * 4]!, g = p.data[i * 4 + 1]!, b = p.data[i * 4 + 2]!;
    out[i] = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return out;
}

/** Separable box blur (clamped at the edges). */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return Float32Array.from(src);
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[y * w + Math.min(w - 1, Math.max(0, x + k))]!;
      tmp[y * w + x] = sum * norm;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]!;
      out[y * w + x] = sum * norm;
    }
  }
  return out;
}

/**
 * Lighting from the silhouette alone: the blurred alpha is a height map, its gradient a
 * normal, and a light from the top-left decides how lit each pixel is (0 shadow … 1 lit).
 */
export function shadeFromAlpha(alpha: Float32Array, w: number, h: number, blurRadius: number): Float32Array {
  const height = boxBlur(boxBlur(alpha, w, h, blurRadius), w, h, blurRadius);
  const out = new Float32Array(alpha.length);
  const lx = -0.6, ly = -0.8; // light direction (towards the light), top-left
  const at = (x: number, y: number) => height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  const gain = blurRadius * 2.2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = (at(x + 1, y) - at(x - 1, y)) * gain;
      const gy = (at(x, y + 1) - at(x, y - 1)) * gain;
      // surface normal ≈ (-gx, -gy, 1); lit when it faces the light
      const lit = (-gx * lx + -gy * ly) / Math.hypot(gx, gy, 1);
      out[y * w + x] = Math.min(1, Math.max(0, 0.62 + lit));
    }
  }
  return out;
}

/** Dot radius for a given ink coverage (0–1) in a square cell of side `cell`. */
export function dotRadius(coverage: number, cell: number): number {
  const f = Math.min(1, Math.max(0, coverage));
  if (f <= 0) return 0;
  if (f <= Math.PI / 4) return cell * Math.sqrt(f / Math.PI);
  // beyond the inscribed circle the dots must reach the cell corners to cover everything
  const t = (f - Math.PI / 4) / (1 - Math.PI / 4);
  return cell * (0.5 + t * (Math.SQRT1_2 - 0.5));
}

/**
 * Rotated halftone screen. `darkness` is 0 (paper) … 1 (solid ink); the result is a
 * 0/1 ink mask. The dot size comes from the darkness at each dot's centre.
 */
export function halftone(darkness: Float32Array, w: number, h: number, cell: number, angleDeg: number): Uint8Array {
  const out = new Uint8Array(darkness.length);
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x * cos + y * sin;
      const v = -x * sin + y * cos;
      const cu = (Math.floor(u / cell) + 0.5) * cell;
      const cv = (Math.floor(v / cell) + 0.5) * cell;
      // centre of this dot back in image space, to read the tone there
      const cx = Math.round(cu * cos - cv * sin);
      const cy = Math.round(cu * sin + cv * cos);
      const sx = Math.min(w - 1, Math.max(0, cx));
      const sy = Math.min(h - 1, Math.max(0, cy));
      const r = dotRadius(darkness[sy * w + sx]!, cell);
      out[y * w + x] = Math.hypot(u - cu, v - cv) <= r ? 1 : 0;
    }
  }
  return out;
}

/** Binary dilation with a disk of radius r (mask values > 0 count as set). */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return Uint8Array.from(mask, (v) => (v > 0 ? 1 : 0));
  const out = new Uint8Array(mask.length);
  const offsets: Array<[number, number]> = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) offsets.push([dx, dy]);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]! === 0) continue;
      for (const [dx, dy] of offsets) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny * w + nx] = 1;
      }
    }
  }
  return out;
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Builds the sticker bitmap. `src` is the piece drawn on a transparent square that already
 * has `border + ring` pixels of padding on every side.
 */
export function makeStickerPixels(src: Pixels, opts: StickerOptions = DEFAULT_STICKER): Pixels {
  const { width: w, height: h } = src;
  const alpha = alphaOf(src);
  const body = Uint8Array.from(alpha, (a) => (a > 0.5 ? 1 : 0));

  // 1. tone: the drawing's own darkness, modulated by the faked lighting
  const shade = shadeFromAlpha(alpha, w, h, Math.max(2, Math.round(opts.size / 28)));
  const drawn = darknessOf(src);
  const tone = new Float32Array(alpha.length);
  for (let i = 0; i < tone.length; i++) {
    tone[i] = Math.min(1, Math.max(0, drawn[i]! * 0.78 + (1 - shade[i]!) * 0.5 - 0.1));
  }

  // 2. halftone
  const ink = halftone(tone, w, h, opts.cell, opts.angle);

  // 3. die-cut
  const paper = dilate(body, w, h, opts.border);
  const ring = opts.ring > 0 ? dilate(body, w, h, opts.border + opts.ring) : paper;

  const [ir, ig, ib] = parseHex(opts.inkColor);
  const [pr, pg, pb] = parseHex(opts.paperColor);
  const [rr, rg, rb] = parseHex(opts.ringColor);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let rgb: [number, number, number] | null = null;
    if (body[i]) rgb = ink[i] ? [ir, ig, ib] : [pr, pg, pb];
    else if (paper[i]) rgb = [pr, pg, pb];
    else if (ring[i]) rgb = [rr, rg, rb];
    if (rgb) {
      data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

// ── Browser rendering (cached) ────────────────────────────────────────────

const cache = new Map<string, Promise<string>>();

/** Draws `url` (an SVG/PNG we ship) into a canvas, turns it into a sticker and returns a data URL. */
export function renderSticker(url: string, partial: Partial<StickerOptions> = {}): Promise<string> {
  const opts: StickerOptions = { ...DEFAULT_STICKER, ...partial };
  const key = JSON.stringify([url, opts]);
  const hit = cache.get(key);
  if (hit) return hit;

  const job = (async () => {
    const img = new Image();
    img.src = url;
    await img.decode();

    const pad = opts.border + opts.ring + 2;
    const side = opts.size + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas unavailable');
    ctx.drawImage(img, pad, pad, opts.size, opts.size);

    const src = ctx.getImageData(0, 0, side, side);
    const out = makeStickerPixels({ width: side, height: side, data: src.data }, opts);
    ctx.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, side, side), 0, 0);
    return canvas.toDataURL('image/png');
  })();

  cache.set(key, job);
  job.catch(() => cache.delete(key)); // let a later call retry
  return job;
}
