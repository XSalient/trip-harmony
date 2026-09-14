import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  BRAND_COLOUR,
  DENSITIES,
  SAFE_ZONE,
  buildLayers,
  planGenerated,
  planNativeIcons,
} from "./nativeIcons.mjs";
import { decodePng, parseHexColour } from "./png.mjs";

const icon = decodePng(fs.readFileSync("resources/icon.png"));
const planned = planGenerated(icon);
const byPath = new Map(planned.map(file => [file.path, file]));

const pixel = (img, x, y) => [
  ...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4),
];

describe("the source art", () => {
  it("is the square both stores ask for", () => {
    expect([icon.width, icon.height]).toEqual([1024, 1024]);
  });

  it("still has the field colour BRAND_COLOUR names", () => {
    // The constant is what the Android background layer and the iOS icon's
    // corners are filled with. If somebody re-exports the art in another
    // purple, every generated icon gets a seam and nothing else notices.
    const counts = new Map();
    for (let i = 0; i < icon.data.length; i += 4) {
      if (icon.data[i + 3] !== 255) continue;
      const key = `${icon.data[i]},${icon.data[i + 1]},${icon.data[i + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [dominant] = [...counts].sort((a, b) => b[1] - a[1])[0];

    expect(dominant).toBe(parseHexColour(BRAND_COLOUR).join(","));
  });
});

describe("planNativeIcons", () => {
  const paths = planNativeIcons(icon).map(file => file.path);

  it("covers every Android density and both adaptive layers", () => {
    for (const [density] of DENSITIES) {
      for (const name of [
        "ic_launcher",
        "ic_launcher_round",
        "ic_launcher_foreground",
        "ic_launcher_background",
      ]) {
        expect(paths).toContain(
          `android/app/src/main/res/mipmap-${density}/${name}.png`
        );
      }
    }
  });

  it("writes the adaptive icon XML for Android 8 and newer", () => {
    expect(paths).toContain(
      "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"
    );
    expect(paths).toContain(
      "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml"
    );
  });

  it("writes the iOS app icon and its catalogue entry", () => {
    expect(paths).toContain(
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
    );
    expect(paths).toContain(
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json"
    );
  });

  it("puts every density at the size its scale factor means", () => {
    for (const [density, scale] of DENSITIES) {
      const launcher = decodePng(
        byPath.get(
          `resources/generated/android/app/src/main/res/mipmap-${density}/ic_launcher.png`
        ).contents
      );
      const layer = decodePng(
        byPath.get(
          `resources/generated/android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`
        ).contents
      );

      expect(launcher.width).toBe(Math.round(48 * scale));
      expect(layer.width).toBe(Math.round(108 * scale));
    }
  });
});

describe("the iOS app icon", () => {
  const file = byPath.get(
    "resources/generated/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
  );

  it("is 1024px with no alpha channel — the App Store rejects one", () => {
    expect(file.contents[8 + 8 + 9]).toBe(2); // IHDR colour type: 2 is RGB
    const decoded = decodePng(file.contents);
    expect([decoded.width, decoded.height]).toEqual([1024, 1024]);
  });

  it("fills the art's rounded corners rather than leaving them clear", () => {
    // iOS masks the icon itself. A transparent corner shows as black, and the
    // art's own rounding inside Apple's rounding reads as a shrunken icon.
    const decoded = decodePng(file.contents);
    expect(pixel(decoded, 0, 0)).toEqual([
      ...parseHexColour(BRAND_COLOUR),
      255,
    ]);
    expect(pixel(decoded, 1023, 1023)).toEqual([
      ...parseHexColour(BRAND_COLOUR),
      255,
    ]);
  });
});

describe("the Android adaptive layers", () => {
  it("keeps the whole mark inside the 72dp safe zone", () => {
    // Everything outside it is the launcher's to crop, in a shape the app does
    // not get to know. Art that reaches the edge loses its corners.
    const layers = buildLayers(icon);
    const margin = Math.floor((layers.foreground.width * (1 - SAFE_ZONE)) / 2);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < layers.foreground.height; y++) {
      for (let x = 0; x < layers.foreground.width; x++) {
        if (
          layers.foreground.data[(y * layers.foreground.width + x) * 4 + 3] ===
          0
        ) {
          continue;
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    expect(minX).toBeGreaterThanOrEqual(margin);
    expect(minY).toBeGreaterThanOrEqual(margin);
    expect(maxX).toBeLessThan(layers.foreground.width - margin);
    expect(maxY).toBeLessThan(layers.foreground.height - margin);
  });

  it("makes the background a flat field of the brand colour", () => {
    const background = decodePng(
      byPath.get(
        "resources/generated/android/app/src/main/res/mipmap-mdpi/ic_launcher_background.png"
      ).contents
    );
    const expected = [...parseHexColour(BRAND_COLOUR), 255];

    expect(pixel(background, 0, 0)).toEqual(expected);
    expect(pixel(background, 107, 107)).toEqual(expected);
  });

  it("gives the round icon clear corners and a solid centre", () => {
    const round = decodePng(
      byPath.get(
        "resources/generated/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png"
      ).contents
    );

    expect(pixel(round, 0, 0)[3]).toBe(0);
    expect(pixel(round, 96, 96)[3]).toBe(255);
  });
});

describe("the store art", () => {
  // Play's two hard requirements on a listing's images. Both are rejected at
  // upload rather than at review, so they are worth asserting here: the
  // feedback loop through the Console is minutes long and the fix is a code
  // change.
  const store = path => byPath.get(`resources/generated/store/${path}`);

  it("is the exact sizes Play accepts", () => {
    expect(store("play-icon-512.png")).toBeDefined();
    const icon512 = decodePng(store("play-icon-512.png").contents);
    expect([icon512.width, icon512.height]).toEqual([512, 512]);

    const feature = decodePng(
      store("play-feature-graphic-1024x500.png").contents
    );
    expect([feature.width, feature.height]).toEqual([1024, 500]);
  });

  it("carries no alpha channel", () => {
    // Colour type 2 is 24-bit truecolour. Play refuses a feature graphic with
    // an alpha channel, and composites a transparent icon onto white — which
    // turns the mark's rounded corners into a pale fringe.
    for (const name of [
      "play-icon-512.png",
      "play-feature-graphic-1024x500.png",
    ]) {
      const png = store(name).contents;
      expect(png[25], `${name} should be colour type 2, no alpha`).toBe(2);
    }
  });

  it("is opaque in the corners, where a listing shows it", () => {
    const feature = decodePng(
      store("play-feature-graphic-1024x500.png").contents
    );
    expect(pixel(feature, 0, 0)).toEqual([
      ...parseHexColour(BRAND_COLOUR),
      255,
    ]);
  });
});

describe("what is committed", () => {
  // `resources/generated/` is checked in so the icons can be reviewed without
  // running anything. That is only worth having if it cannot go stale, which
  // is what this asserts: same rule as a schema change and its migration.
  it("matches what the source art produces today", () => {
    const stale = planned.filter(file => {
      if (!fs.existsSync(file.path)) return true;
      const committed = fs.readFileSync(file.path);
      if (!file.path.endsWith(".png")) return !committed.equals(file.contents);
      // Pixels, not bytes: a different zlib build compresses differently and
      // that is not drift.
      const a = decodePng(committed);
      const b = decodePng(file.contents);
      return a.width !== b.width || !a.data.equals(b.data);
    });

    expect(stale.map(file => file.path)).toEqual([]);
  });

  it("has nothing in it the plan does not produce", () => {
    const onDisk = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else onDisk.push(full);
      }
    };
    walk("resources/generated");

    expect(onDisk.sort()).toEqual(planned.map(file => file.path).sort());
  });
});
