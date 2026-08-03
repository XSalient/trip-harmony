#!/usr/bin/env node
/**
 * Runs only the tests that the current change can reach.
 *
 *   node scripts/affected-tests.mjs                 compare against origin/master
 *   node scripts/affected-tests.mjs --base <ref>    compare against another ref
 *   node scripts/affected-tests.mjs --list          print the selection, run nothing
 *
 * The full suite still runs on a schedule and whenever the change touches
 * something the import graph cannot reason about — see scripts/lib/affected.mjs.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildClosures, selectTests } from "./lib/affected.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
}

/**
 * The merge base is the honest comparison point: it asks "what does this
 * branch change", not "what has master done since I forked".
 */
function changedFiles(base) {
  try {
    const mergeBase = git(["merge-base", base, "HEAD"]);
    const committed = git(["diff", "--name-only", mergeBase, "HEAD"]);
    const uncommitted = git(["diff", "--name-only", "HEAD"]);
    return [...new Set([...committed.split("\n"), ...uncommitted.split("\n")])]
      .map(file => file.trim())
      .filter(Boolean);
  } catch {
    return null; // no merge base (shallow clone, unknown ref): caller falls back
  }
}

/**
 * Walks the tree rather than asking git, so a test file that is new and not
 * yet staged still gets picked up. Mirrors the include patterns in
 * vitest.config.ts — if those change, change these.
 */
function testFiles(dirs = ["server", "scripts"]) {
  const found = [];

  const walk = dir => {
    const absolute = path.join(repoRoot, dir);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(relative);
      } else if (/\.(test|spec)\.(ts|mjs)$/.test(entry.name)) {
        found.push(relative);
      }
    }
  };

  for (const dir of dirs) walk(dir);
  return found.sort();
}

function runVitest(args) {
  const result = spawnSync("pnpm", ["exec", "vitest", "run", ...args], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

const base = argValue("--base", process.env.AFFECTED_BASE ?? "origin/master");
const listOnly = process.argv.includes("--list");

const changed = changedFiles(base);

if (changed === null) {
  console.log(`[affected] cannot diff against ${base}; running the full suite`);
  if (listOnly) process.exit(0);
  runVitest([]);
}

const closures = buildClosures(testFiles(), {
  readFile: file => {
    const absolute = path.join(repoRoot, file);
    return existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
  },
  exists: file => existsSync(path.join(repoRoot, file)),
});

const selection = selectTests(changed, closures);

console.log(`[affected] base ${base}, ${changed.length} changed file(s)`);
console.log(`[affected] ${selection.mode}: ${selection.reason}`);
for (const test of selection.tests) console.log(`[affected]   ${test}`);

if (listOnly) process.exit(0);

if (selection.mode === "none") {
  console.log("[affected] nothing to run");
  process.exit(0);
}

runVitest(selection.mode === "all" ? [] : selection.tests);
