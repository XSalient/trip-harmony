/**
 * Every relative import that ships to the serverless function must name a file
 * Node can actually resolve.
 *
 * Vercel does not bundle `api/server.ts`. It transpiles the import graph file
 * by file into `/var/task/**` and runs it as native ESM, where an extensionless
 * specifier is not resolved — Node does not try `./roles.ts`, `./roles.js` or
 * `./roles/index.js`. The import throws at module load, before any route is
 * registered, so the function never starts and Vercel answers every request —
 * `/api/health` included — with the plain-text body "A server error has
 * occurred". A client parsing that as JSON reports
 * `Unexpected token 'A', "A server e"... is not valid JSON`, which names
 * neither the file nor the import.
 *
 * Nothing else in the toolchain catches it:
 *
 *  - `tsc` is set to `moduleResolution: "bundler"`, which permits the omission.
 *  - `pnpm dev` runs under tsx, which resolves it.
 *  - `pnpm build` runs esbuild with `--bundle`, which resolves it.
 *
 * So the one runtime that rejects it is the only one a user meets. That is what
 * this test stands in for: it is the whole `pnpm verify` signal for a failure
 * that otherwise only appears in production.
 *
 * `shared/votes.ts` importing `./roles` took every sign-in method down this way.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");

/** The directories the serverless function's import graph can reach. */
const DEPLOYED_DIRS = ["api", "server", "shared", "drizzle"];

/** Extensions Node resolves as written, so a specifier may end in one. */
const EXPLICIT = /\.(js|mjs|cjs|json|node)$/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    // Tests are not deployed, and vitest resolves them itself.
    if (entry.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(entry))
      found.push(path);
  }
  return found;
}

/** Matches `from "./x"`, `import("./x")` and `export … from "./x"`. */
const RELATIVE_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.[^"']*)["']/g;

/**
 * Comments are stripped first: a JSDoc `@example` showing an import is not one,
 * and `voiceTranscription.ts` has exactly that. Line comments are only removed
 * when the `//` does not follow a colon, so a URL in a string survives.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

type Specifier = { file: string; specifier: string };

const specifiers: Specifier[] = DEPLOYED_DIRS.flatMap(dir =>
  sourceFiles(join(repoRoot, dir)).flatMap(file => {
    const source = withoutComments(readFileSync(file, "utf8"));
    return [...source.matchAll(RELATIVE_SPECIFIER)].map(match => ({
      file: file.slice(repoRoot.length + 1),
      specifier: match[1],
    }));
  })
);

describe("relative imports in the deployed graph", () => {
  it("has files to check at all", () => {
    // A scan that silently matched nothing would pass for ever.
    expect(specifiers.length).toBeGreaterThan(100);
  });

  it("names an extension Node can resolve", () => {
    const bare = specifiers
      .filter(({ specifier }) => !EXPLICIT.test(specifier))
      .map(({ file, specifier }) => `${file}: "${specifier}"`);

    expect(
      bare,
      'Node ESM does not guess extensions — write "./x.js", even though the file is x.ts'
    ).toEqual([]);
  });

  it("points at a file that exists", () => {
    // Catches the other half: a `.js` extension is necessary but does not make
    // the path right, and a typo fails identically at module load.
    const missing = specifiers
      .filter(({ specifier }) => EXPLICIT.test(specifier))
      .filter(({ file, specifier }) => {
        const target = resolve(repoRoot, dirname(file), specifier);
        // `./x.js` is written for Node but authored as `x.ts`; either may exist.
        return ![target, target.replace(/\.js$/, ".ts")].some(candidate => {
          try {
            return statSync(candidate).isFile();
          } catch {
            return false;
          }
        });
      })
      .map(({ file, specifier }) => `${file}: "${specifier}"`);

    expect(missing, "these imports resolve to nothing").toEqual([]);
  });
});
