/**
 * Choosing which tests a change actually needs.
 *
 * The selection is derived from the real import graph rather than a
 * hand-written "this file maps to that test" table. A table would be one more
 * thing to keep in step with the code, and a stale one fails silently by
 * skipping the test that would have caught the bug.
 *
 * Everything here is pure and takes its file reads as an argument, so the
 * selection logic is testable without a repository on disk.
 */

import path from "node:path";

/**
 * Changes whose blast radius the import graph cannot see. A lockfile bump or
 * an edit to the runner itself can break any test, so they take the whole
 * suite.
 */
export const FULL_SUITE_PATHS = [
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "vitest.config.ts",
  "vite.config.ts",
];

export const FULL_SUITE_PREFIXES = ["scripts/", ".github/"];

export function forcesFullSuite(file) {
  return (
    FULL_SUITE_PATHS.includes(file) ||
    FULL_SUITE_PREFIXES.some(prefix => file.startsWith(prefix))
  );
}

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

/**
 * Import specifiers in a module: static `import`/`export … from`, and
 * `import(…)` with a literal argument. Comments are stripped first so a
 * commented-out import does not invent an edge.
 */
export function parseImports(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const specifiers = [];
  const patterns = [
    /(?:^|\s)(?:import|export)\s[\s\S]*?from\s*["']([^"']+)["']/g,
    /(?:^|\s)import\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * A specifier resolved to a repository-relative path, or null when it leaves
 * the repository (a package) or points at something absent.
 *
 * TypeScript source is imported with a `.js` suffix under this repo's module
 * resolution, so `./db.js` has to find `server/db.ts`.
 */
export function resolveSpecifier(specifier, fromFile, exists) {
  let base;

  if (specifier.startsWith("@shared/")) {
    base = path.posix.join("shared", specifier.slice("@shared/".length));
  } else if (specifier.startsWith("@/")) {
    base = path.posix.join("client/src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.posix.join(path.posix.dirname(fromFile), specifier);
  } else {
    return null; // a package
  }

  const withoutJs = base.replace(/\.(js|mjs)$/, "");
  const candidates = [
    base,
    ...EXTENSIONS.map(ext => withoutJs + ext),
    ...EXTENSIONS.map(ext => path.posix.join(withoutJs, "index" + ext)),
  ];

  return candidates.find(candidate => exists(candidate)) ?? null;
}

/**
 * Every repository file each test reaches, directly or through its imports.
 * Returns a Map of test file to the Set of files it depends on (itself
 * included).
 */
export function buildClosures(testFiles, { readFile, exists }) {
  const directDeps = new Map();

  const depsOf = file => {
    if (directDeps.has(file)) return directDeps.get(file);
    const source = readFile(file);
    const resolved =
      source === null
        ? []
        : parseImports(source)
            .map(specifier => resolveSpecifier(specifier, file, exists))
            .filter(Boolean);
    directDeps.set(file, resolved);
    return resolved;
  };

  const closures = new Map();

  for (const test of testFiles) {
    const seen = new Set([test]);
    const queue = [test];
    while (queue.length > 0) {
      for (const dep of depsOf(queue.pop())) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        queue.push(dep);
      }
    }
    closures.set(test, seen);
  }

  return closures;
}

/**
 * The tests a set of changed files requires.
 *
 * `reason` is for the log: a run that silently narrows to nothing is hard to
 * trust, so the runner always says why it chose what it did.
 */
export function selectTests(changedFiles, closures) {
  if (changedFiles.length === 0) {
    return { mode: "none", tests: [], reason: "no changed files" };
  }

  const forcing = changedFiles.filter(forcesFullSuite);
  if (forcing.length > 0) {
    return {
      mode: "all",
      tests: [...closures.keys()],
      reason: `${forcing[0]} changed`,
    };
  }

  const changed = new Set(changedFiles);
  const tests = [...closures.entries()]
    .filter(([, closure]) => [...changed].some(file => closure.has(file)))
    .map(([test]) => test)
    .sort();

  if (tests.length === 0) {
    return {
      mode: "none",
      tests: [],
      reason: "no test imports any changed file",
    };
  }

  return {
    mode: "some",
    tests,
    reason: `${tests.length} of ${closures.size} test file(s) reach the change`,
  };
}
