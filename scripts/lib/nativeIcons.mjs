/**
 * Every icon file the iOS and Android apps need, derived from one 1024px
 * source.
 *
 * `resources/icon.png` is the only art anybody edits. Everything else — the
 * adaptive-icon layers, the round icon, the density ladder, the iOS app icon —
 * is computed here, because the alternative is twenty-odd exported files that
 * nobody can tell apart six months later and that drift one at a time.
 *
 * Pure: it takes a decoded image and returns file contents. `scripts/
 * native-icons.mjs` does the reading and writing, and the drift test beside
 * this file checks that what is committed still matches what this produces.
 *
 * The two shape rules worth knowing, because they are why the layers differ:
 *
 * - **Android adaptive icons are cropped by the launcher**, to a circle, a
 *   squircle, a teardrop — the app does not choose. Each layer is 108dp and
 *   only the middle 72dp always survives, so the foreground here is the mark
 *   scaled into that 72dp square over a separate flat background layer.
 * - **iOS masks the icon itself** and refuses an alpha channel. The source
 *   art's rounded corners are filled with its own field colour so the square
 *   is complete, and iOS rounds it the way it rounds every other icon on the
 *   home screen. Leaving the art's corners would round it twice.
 */

import {
  centre,
  circleMask,
  encodePng,
  fillTransparent,
  over,
  parseHexColour,
  resize,
  solid,
} from "./png.mjs";

/**
 * The field colour of the mark, used for the Android adaptive background and
 * to fill the iOS icon's corners. Not sampled from the art at runtime — a
 * colour that silently followed whatever was in the file would swap the brand
 * for whatever a bad export produced. A test asserts it still matches
 * `resources/icon.png`, which is the check that was actually wanted.
 */
export const BRAND_COLOUR = "#a855f7";

/** Android's adaptive layer is 108dp; only the middle 72dp is guaranteed. */
export const SAFE_ZONE = 72 / 108;

/** `mipmap-<density>` and the px-per-dp each stands for. */
export const DENSITIES = [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
];

const ANDROID_RES = "android/app/src/main/res";
const IOS_APPICON = "ios/App/App/Assets.xcassets/AppIcon.appiconset";

const ADAPTIVE_ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;

/**
 * Xcode 14 and later take a single 1024px icon and derive the rest. The long
 * per-device list older projects carry is still accepted, and is still twenty
 * files to keep in step for no gain.
 */
const IOS_CONTENTS_JSON = `${JSON.stringify(
  {
    images: [
      {
        filename: "AppIcon-512@2x.png",
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
    ],
    info: { author: "xcode", version: 1 },
  },
  null,
  2
)}\n`;

/**
 * The three layers every output is cut from.
 *
 * @param {{width: number, height: number, data: Buffer}} icon the 1024px source
 */
export function buildLayers(icon) {
  const size = icon.width;
  const colour = parseHexColour(BRAND_COLOUR);
  const background = solid(size, colour);

  /**
   * The mark with its rounded corners filled in: a complete square of field
   * colour, no transparency and no pale edge. Everything except the legacy
   * Android icon is cut from this, so the seam between the mark and a
   * background of the same colour never shows.
   */
  const square = fillTransparent(icon, colour);
  const inner = Math.round(size * SAFE_ZONE);
  const foreground = centre(resize(square, inner, inner), size);

  return {
    /** The source as drawn: rounded square, corners transparent. */
    source: icon,
    /** Adaptive background: the field colour, edge to edge. */
    background,
    /** Adaptive foreground: the mark inside the 72dp safe zone. */
    foreground,
    /** What a launcher actually shows once it has masked the two layers. */
    masked: over(background, foreground),
    /** iOS: complete square, no transparency anywhere. */
    square,
  };
}

/**
 * @returns {{path: string, contents: Buffer, note: string}[]} every file to
 *   write, at its path relative to the repository root.
 */
export function planNativeIcons(icon) {
  const layers = buildLayers(icon);
  const files = [];

  const png = (path, image, note, options) =>
    files.push({ path, contents: encodePng(image, options), note });

  for (const [density, scale] of DENSITIES) {
    const dir = `${ANDROID_RES}/mipmap-${density}`;
    const launcher = Math.round(48 * scale);
    const layer = Math.round(108 * scale);

    png(
      `${dir}/ic_launcher.png`,
      resize(layers.source, launcher, launcher),
      `${launcher}px legacy icon (Android 7 and older)`
    );
    png(
      `${dir}/ic_launcher_round.png`,
      circleMask(resize(layers.masked, launcher, launcher)),
      `${launcher}px round icon`
    );
    png(
      `${dir}/ic_launcher_foreground.png`,
      resize(layers.foreground, layer, layer),
      `${layer}px adaptive foreground`
    );
    png(
      `${dir}/ic_launcher_background.png`,
      resize(layers.background, layer, layer),
      `${layer}px adaptive background`
    );
  }

  for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    files.push({
      path: `${ANDROID_RES}/mipmap-anydpi-v26/${name}`,
      contents: Buffer.from(ADAPTIVE_ICON_XML, "utf-8"),
      note: "adaptive icon, Android 8 and newer",
    });
  }

  png(
    `${IOS_APPICON}/AppIcon-512@2x.png`,
    layers.square,
    "1024px app icon, no alpha channel",
    { alpha: false }
  );
  files.push({
    path: `${IOS_APPICON}/Contents.json`,
    contents: Buffer.from(IOS_CONTENTS_JSON, "utf-8"),
    note: "asset catalogue entry",
  });

  return files;
}

/**
 * The same art in the layout `npx @capacitor/assets generate` expects, written
 * beside the generated tree so that tool remains a working fallback without
 * anybody having to re-derive the layers by hand.
 */
export function planAssetSources(icon) {
  const layers = buildLayers(icon);
  return [
    { path: "icon.png", image: layers.source, note: "the source, unchanged" },
    {
      path: "icon-foreground.png",
      image: layers.foreground,
      note: "adaptive foreground",
    },
    {
      path: "icon-background.png",
      image: layers.background,
      note: "adaptive background",
    },
  ].map(file => ({ ...file, contents: encodePng(file.image) }));
}

/** Where the generated tree lives, relative to the repository root. */
export const GENERATED_ROOT = "resources/generated";

/**
 * Every file `pnpm icons:native` writes, at its path relative to the
 * repository root.
 *
 * One list, used by the generator and by the test that checks the committed
 * output still matches the source art — so the two cannot disagree about what
 * should exist.
 *
 * `nativePath` is set on the files that belong inside a native project, and is
 * where they are copied when `ios/` or `android/` is present in the checkout.
 */
export function planGenerated(icon) {
  return [
    ...planNativeIcons(icon).map(file => ({
      ...file,
      path: `${GENERATED_ROOT}/${file.path}`,
      nativePath: file.path,
    })),
    ...planAssetSources(icon).map(file => ({
      ...file,
      path: `${GENERATED_ROOT}/capacitor-assets/${file.path}`,
      nativePath: null,
      note: `${file.note} — for \`npx @capacitor/assets\`, the fallback path`,
    })),
  ];
}
