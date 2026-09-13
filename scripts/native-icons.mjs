#!/usr/bin/env node
/**
 * Generate the iOS and Android app icons from `resources/icon.png`.
 *
 *     pnpm icons:native          # write them
 *     pnpm icons:native --check  # fail if what is committed is out of date
 *
 * Output goes to `resources/generated/`, which is committed, and — when the
 * native projects exist in this checkout — straight into `ios/` and `android/`
 * as well. Those two directories are created by `npx cap add` on a Mac and are
 * not in this repository, so the generated tree is how the icons are reviewed
 * and verified before anyone has a Mac in front of them, and what a fresh
 * `npx cap add` gets followed by.
 *
 * Nothing is installed and nothing is fetched: the image code is in
 * `scripts/lib/png.mjs`, which is why `pnpm test` can check this output rather
 * than trusting it. The usual tool, `npx @capacitor/assets generate`, needs a
 * native `sharp` binary and so can only run on the machine doing the release —
 * the one place an icon mistake is most expensive to find.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planGenerated } from "./lib/nativeIcons.mjs";
import { decodePng } from "./lib/png.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "resources/icon.png";

const check = process.argv.includes("--check");
const absolute = file => path.join(ROOT, file);

if (!fs.existsSync(absolute(SOURCE))) {
  console.error(`missing ${SOURCE} — nothing to generate`);
  process.exit(1);
}

const icon = decodePng(fs.readFileSync(absolute(SOURCE)));
if (icon.width !== 1024 || icon.height !== 1024) {
  console.error(
    `${SOURCE} is ${icon.width}×${icon.height}; both stores want 1024×1024`
  );
  process.exit(1);
}

const files = planGenerated(icon);

if (check) {
  const stale = files.filter(file => {
    const target = absolute(file.path);
    return (
      !fs.existsSync(target) || !fs.readFileSync(target).equals(file.contents)
    );
  });

  if (stale.length > 0) {
    console.error(`${stale.length} generated file(s) do not match ${SOURCE}:`);
    for (const file of stale) console.error(`  ${file.path}`);
    console.error("\nRun `pnpm icons:native` and commit the result.");
    process.exit(1);
  }

  console.log(`${files.length} generated files match ${SOURCE}`);
  process.exit(0);
}

for (const file of files) write(absolute(file.path), file.contents);

const installed = [];
for (const file of files) {
  if (!file.nativePath) continue;
  const platform = file.nativePath.split("/")[0];
  if (!fs.existsSync(absolute(platform))) continue;
  write(absolute(file.nativePath), file.contents);
  installed.push(file.nativePath);
}

console.log(`Wrote ${files.length} files to resources/generated/`);

for (const platform of ["ios", "android"]) {
  const count = installed.filter(file =>
    file.startsWith(`${platform}/`)
  ).length;
  console.log(
    count > 0
      ? `  ${platform}/ — installed ${count} files`
      : `  ${platform}/ — not in this checkout; run this again after \`npx cap add ${platform}\``
  );
}

function write(destination, contents) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents);
}
