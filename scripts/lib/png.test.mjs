import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  blank,
  circleMask,
  decodePng,
  encodePng,
  fillTransparent,
  over,
  parseHexColour,
  resize,
  solid,
} from "./png.mjs";

/** A tiny image built by hand, so the expected pixels are obvious. */
function image(width, height, pixels) {
  const img = blank(width, height);
  pixels.forEach((pixel, i) => {
    img.data.set(pixel, i * 4);
  });
  return img;
}

const pixel = (img, x, y) => [
  ...img.data.subarray((y * img.width + x) * 4).subarray(0, 4),
];

describe("encode and decode", () => {
  it("round-trips RGBA exactly", () => {
    const source = image(2, 2, [
      [255, 0, 0, 255],
      [0, 255, 0, 128],
      [0, 0, 255, 0],
      [10, 20, 30, 40],
    ]);

    const decoded = decodePng(encodePng(source));

    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(decoded.data.equals(source.data)).toBe(true);
  });

  it("writes no alpha channel when asked, which is what iOS requires", () => {
    const encoded = encodePng(solid(4, [1, 2, 3]), { alpha: false });

    // IHDR's colour type is the tenth byte of the chunk body: 2 is RGB, 6 RGBA.
    expect(encoded[8 + 8 + 9]).toBe(2);
    expect(decodePng(encoded).data.subarray(0, 4)).toEqual(
      Buffer.from([1, 2, 3, 255])
    );
  });

  it("reads a palette image with transparency", () => {
    // The real source art: 8-bit palette plus tRNS, which is what icon
    // exporters emit and what the hand-written decoder exists to read.
    const icon = decodePng(fs.readFileSync("resources/icon.png"));

    expect([icon.width, icon.height]).toEqual([1024, 1024]);
    expect(pixel(icon, 0, 0)[3]).toBe(0); // rounded corner
    expect(pixel(icon, 512, 512)).toEqual([168, 85, 247, 255]); // field colour
  });

  it("refuses what it cannot read instead of decoding nonsense", () => {
    expect(() => decodePng(Buffer.alloc(32))).toThrow(/bad signature/);
  });
});

describe("resize", () => {
  it("averages the pixels a destination pixel covers", () => {
    const source = image(2, 2, [
      [0, 0, 0, 255],
      [100, 100, 100, 255],
      [100, 100, 100, 255],
      [200, 200, 200, 255],
    ]);

    expect(pixel(resize(source, 1, 1), 0, 0)).toEqual([100, 100, 100, 255]);
  });

  it("does not bleed a transparent pixel's colour into its neighbour", () => {
    // Black-but-transparent beside opaque red. Averaged naively the result is
    // a dark red halo; averaged premultiplied it stays red at half alpha.
    const source = image(2, 1, [
      [255, 0, 0, 255],
      [0, 0, 0, 0],
    ]);

    expect(pixel(resize(source, 1, 1), 0, 0)).toEqual([255, 0, 0, 128]);
  });
});

describe("compositing", () => {
  it("fillTransparent replaces anything not fully opaque", () => {
    const source = image(3, 1, [
      [10, 20, 30, 255],
      [10, 20, 30, 254],
      [10, 20, 30, 0],
    ]);

    const filled = fillTransparent(source, [1, 2, 3]);

    expect(pixel(filled, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(pixel(filled, 1, 0)).toEqual([1, 2, 3, 255]);
    expect(pixel(filled, 2, 0)).toEqual([1, 2, 3, 255]);
  });

  it("over places the top image at an offset and leaves the rest alone", () => {
    const base = solid(2, [0, 0, 0]);
    const top = image(1, 1, [[255, 255, 255, 255]]);

    const result = over(base, top, 1, 1);

    expect(pixel(result, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(result, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  it("circleMask clears the corners and keeps the centre", () => {
    const masked = circleMask(solid(32, [9, 9, 9]));

    expect(pixel(masked, 0, 0)[3]).toBe(0);
    expect(pixel(masked, 16, 16)).toEqual([9, 9, 9, 255]);
  });
});

describe("parseHexColour", () => {
  it("reads six digits with or without the hash", () => {
    expect(parseHexColour("#a855f7")).toEqual([168, 85, 247]);
    expect(parseHexColour("a855f7")).toEqual([168, 85, 247]);
  });

  it("rejects anything else rather than guessing", () => {
    expect(() => parseHexColour("#abc")).toThrow(/hex colour/);
  });
});
