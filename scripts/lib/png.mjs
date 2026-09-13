/**
 * Just enough PNG to generate the app's icons, in plain Node with no
 * dependencies.
 *
 * The usual answer is `npx @capacitor/assets generate`, which pulls `sharp` —
 * a native binary — at the moment somebody runs it. That tool is fine and the
 * runbook still names it as the fallback, but it cannot be run here: icon
 * generation would be the one build step nobody could check before a release,
 * on a project with one person on it. Everything below is pure JavaScript, so
 * the icons are produced and verified by `pnpm test` like any other output.
 *
 * The subset is deliberate: 8-bit, non-interlaced, colour types 0/2/3/6 — what
 * every icon exporter emits. Anything else throws by name rather than decoding
 * to quiet nonsense.
 *
 * An image here is `{ width, height, data }` where `data` is straight (not
 * premultiplied) RGBA, one byte per channel.
 */

import zlib from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bytes per pixel in the *raw* (pre-expansion) scanline, per colour type. */
const RAW_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("not a PNG (bad signature)");
  }

  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === "PLTE") {
      palette = body;
    } else if (type === "tRNS") {
      transparency = body;
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!header) throw new Error("PNG has no IHDR");
  if (header.depth !== 8) {
    throw new Error(`unsupported PNG bit depth ${header.depth} (want 8)`);
  }
  if (header.interlace !== 0) {
    throw new Error("unsupported interlaced PNG");
  }
  const channels = RAW_CHANNELS[header.colorType];
  if (!channels) {
    throw new Error(`unsupported PNG colour type ${header.colorType}`);
  }

  const { width, height, colorType } = header;
  const raw = unfilter(
    zlib.inflateSync(Buffer.concat(idat)),
    width,
    height,
    channels
  );

  const data = Buffer.alloc(width * height * 4);
  for (
    let i = 0, s = 0, d = 0;
    i < width * height;
    i++, s += channels, d += 4
  ) {
    if (colorType === 3) {
      const index = raw[s];
      data[d] = palette[index * 3];
      data[d + 1] = palette[index * 3 + 1];
      data[d + 2] = palette[index * 3 + 2];
      data[d + 3] =
        transparency && index < transparency.length ? transparency[index] : 255;
    } else if (colorType === 0 || colorType === 4) {
      data[d] = data[d + 1] = data[d + 2] = raw[s];
      data[d + 3] = colorType === 4 ? raw[s + 1] : 255;
    } else {
      data[d] = raw[s];
      data[d + 1] = raw[s + 1];
      data[d + 2] = raw[s + 2];
      data[d + 3] = colorType === 6 ? raw[s + 3] : 255;
    }
  }

  return { width, height, data };
}

/**
 * Undo the per-scanline filters. Each row carries its filter type in a leading
 * byte and may refer to the pixel to its left and the row above, so this runs
 * top to bottom over the same buffer it is filling.
 */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);

  for (let y = 0, pos = 0; y < height; y++) {
    const type = raw[pos++];
    const row = y * stride;
    const prior = row - stride;

    for (let x = 0; x < stride; x++) {
      const value = raw[pos + x];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prior + x] : 0;
      const c = x >= bpp && y > 0 ? out[prior + x - bpp] : 0;

      let add = 0;
      if (type === 1) add = a;
      else if (type === 2) add = b;
      else if (type === 3) add = (a + b) >> 1;
      else if (type === 4) add = paeth(a, b, c);
      else if (type !== 0) throw new Error(`unknown PNG filter ${type}`);

      out[row + x] = (value + add) & 0xff;
    }
    pos += stride;
  }

  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * @param {{width: number, height: number, data: Buffer}} image
 * @param {{alpha?: boolean}} options `alpha: false` writes RGB with no alpha
 *   channel at all — which is what an iOS app icon must be. A fully opaque
 *   RGBA file is not the same thing: the App Store rejects on the channel's
 *   presence, not on its contents.
 */
export function encodePng(image, { alpha = true } = {}) {
  const { width, height, data } = image;
  const bpp = alpha ? 4 : 3;
  const stride = width * bpp;

  const pixels = Buffer.alloc(stride * height);
  for (let i = 0, s = 0, d = 0; i < width * height; i++, s += 4, d += bpp) {
    pixels[d] = data[s];
    pixels[d + 1] = data[s + 1];
    pixels[d + 2] = data[s + 2];
    if (alpha) pixels[d + 3] = data[s + 3];
  }

  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    chooseFilter(pixels, filtered, y, stride, bpp);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(filtered, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Pick the filter that makes a row cheapest to compress, by the sum-of-
 * absolute-differences heuristic the PNG spec suggests. Flat colour — most of
 * an app icon — collapses to almost nothing under Sub or Up.
 */
function chooseFilter(pixels, out, y, stride, bpp) {
  const row = y * stride;
  const prior = row - stride;
  const dest = y * (stride + 1);
  let best = null;

  for (let type = 0; type <= 4; type++) {
    let score = 0;
    const candidate = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[row + x - bpp] : 0;
      const b = y > 0 ? pixels[prior + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[prior + x - bpp] : 0;

      let sub = 0;
      if (type === 1) sub = a;
      else if (type === 2) sub = b;
      else if (type === 3) sub = (a + b) >> 1;
      else if (type === 4) sub = paeth(a, b, c);

      const value = (pixels[row + x] - sub) & 0xff;
      candidate[x] = value;
      score += value < 128 ? value : 256 - value;
    }
    if (best === null || score < best.score) best = { type, candidate, score };
  }

  out[dest] = best.type;
  best.candidate.copy(out, dest + 1);
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/**
 * Node grew a built-in `zlib.crc32` in 20.15. Written out rather than called,
 * because this repository does not otherwise care which patch release of Node
 * a developer's machine is on and one unreadable `TypeError` from a laptop on
 * Node 18 costs more than eight lines.
 */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function blank(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

/** A fully opaque rectangle of one colour. */
export function solid(size, [r, g, b]) {
  const image = blank(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = r;
    image.data[i + 1] = g;
    image.data[i + 2] = b;
    image.data[i + 3] = 255;
  }
  return image;
}

/**
 * Box-filter resize: each destination pixel averages the source pixels it
 * covers. Averaging happens on premultiplied values, or a transparent pixel's
 * arbitrary colour would bleed into the edge of the mark as a dark fringe.
 */
export function resize(image, width, height) {
  const out = blank(width, height);
  const spans = (count, total) =>
    Array.from({ length: count }, (_, i) => {
      const start = Math.floor((i * total) / count);
      const end = Math.max(start + 1, Math.floor(((i + 1) * total) / count));
      return [start, end];
    });

  const xs = spans(width, image.width);
  const ys = spans(height, image.height);

  for (let y = 0; y < height; y++) {
    const [y0, y1] = ys[y];
    for (let x = 0; x < width; x++) {
      const [x0, x1] = xs[x];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * image.width + sx) * 4;
          const alpha = image.data[i + 3];
          r += image.data[i] * alpha;
          g += image.data[i + 1] * alpha;
          b += image.data[i + 2] * alpha;
          a += alpha;
          count++;
        }
      }

      const d = (y * width + x) * 4;
      if (a > 0) {
        out.data[d] = Math.round(r / a);
        out.data[d + 1] = Math.round(g / a);
        out.data[d + 2] = Math.round(b / a);
        out.data[d + 3] = Math.round(a / count);
      }
    }
  }

  return out;
}

/**
 * Replace every pixel that is not fully opaque with `rgb`, at full alpha.
 *
 * Not the same as compositing the image over a filled rectangle, and the
 * difference is visible. The source art was exported against something light,
 * so the anti-aliased pixels along its rounded edge carry a paler colour;
 * composited over the brand purple they survive as a faint bright outline
 * tracing the corners — on the iOS icon, and inside the Android round icon,
 * where there is no mask to hide it. Those pixels are edge artefacts, not art.
 * Overwriting them outright is what makes the square seamless.
 */
export function fillTransparent(image, [r, g, b]) {
  const out = { ...image, data: Buffer.from(image.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 255) continue;
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = 255;
  }
  return out;
}

/** Source-over composite of `top` onto a copy of `base` at (x, y). */
export function over(base, top, x = 0, y = 0) {
  const out = { ...base, data: Buffer.from(base.data) };

  for (let ty = 0; ty < top.height; ty++) {
    const by = y + ty;
    if (by < 0 || by >= base.height) continue;
    for (let tx = 0; tx < top.width; tx++) {
      const bx = x + tx;
      if (bx < 0 || bx >= base.width) continue;

      const s = (ty * top.width + tx) * 4;
      const d = (by * base.width + bx) * 4;
      const sa = top.data[s + 3] / 255;
      if (sa === 0) continue;

      const da = out.data[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        out.data[d + c] = Math.round(
          (top.data[s + c] * sa + out.data[d + c] * da * (1 - sa)) / oa
        );
      }
      out.data[d + 3] = Math.round(oa * 255);
    }
  }

  return out;
}

/** Centre `image` on a transparent square canvas of `size`. */
export function centre(image, size) {
  return over(
    blank(size, size),
    image,
    Math.round((size - image.width) / 2),
    Math.round((size - image.height) / 2)
  );
}

/**
 * Clear everything outside the inscribed circle, with a one-pixel feather so
 * the edge does not read as a staircase at 48px.
 */
export function circleMask(image) {
  const out = { ...image, data: Buffer.from(image.data) };
  const centreX = (image.width - 1) / 2;
  const centreY = (image.height - 1) / 2;
  const radius = Math.min(image.width, image.height) / 2;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const distance = Math.hypot(x - centreX, y - centreY);
      const coverage = Math.min(1, Math.max(0, radius - distance));
      if (coverage < 1) {
        const i = (y * image.width + x) * 4;
        out.data[i + 3] = Math.round(out.data[i + 3] * coverage);
      }
    }
  }

  return out;
}

export function parseHexColour(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a six-digit hex colour: ${hex}`);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
