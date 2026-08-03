import { describe, expect, it } from "vitest";
import {
  buildClosures,
  forcesFullSuite,
  parseImports,
  resolveSpecifier,
  selectTests,
} from "./affected.mjs";

/** A fake repository: a map of path to source. */
function fixture(files) {
  return {
    readFile: file => files[file] ?? null,
    exists: file => Object.hasOwn(files, file),
  };
}

describe("parseImports", () => {
  it("finds static, side-effect and dynamic imports", () => {
    const found = parseImports(`
      import { a } from "./a.js";
      import "./side-effect.js";
      export { b } from "../b.js";
      const c = await import("./c.js");
    `);
    expect(found).toEqual(
      expect.arrayContaining([
        "./a.js",
        "./side-effect.js",
        "../b.js",
        "./c.js",
      ])
    );
  });

  it("spans the multi-line import formatting prettier produces", () => {
    expect(
      parseImports(
        `import {\n  one,\n  two,\n} from "../../drizzle/schema.js";`
      )
    ).toEqual(["../../drizzle/schema.js"]);
  });

  it("ignores commented-out imports", () => {
    const found = parseImports(`
      // import { old } from "./removed.js";
      /* import { gone } from "./deleted.js"; */
      import { real } from "./kept.js";
    `);
    expect(found).toEqual(["./kept.js"]);
  });
});

describe("resolveSpecifier", () => {
  const { exists } = fixture({
    "server/db.ts": "",
    "shared/const.ts": "",
    "client/src/lib/x.ts": "",
    "server/routers/index.ts": "",
  });

  it("resolves a .js specifier to the TypeScript source", () => {
    expect(resolveSpecifier("./db.js", "server/app.ts", exists)).toBe(
      "server/db.ts"
    );
  });

  it("resolves a directory import to its index", () => {
    expect(resolveSpecifier("./routers", "server/app.ts", exists)).toBe(
      "server/routers/index.ts"
    );
  });

  it("resolves the @shared and @ aliases", () => {
    expect(resolveSpecifier("@shared/const.js", "server/a.ts", exists)).toBe(
      "shared/const.ts"
    );
    expect(resolveSpecifier("@/lib/x.js", "client/src/a.ts", exists)).toBe(
      "client/src/lib/x.ts"
    );
  });

  it("returns null for packages and for files that are not there", () => {
    expect(resolveSpecifier("drizzle-orm", "server/db.ts", exists)).toBeNull();
    expect(resolveSpecifier("./nope.js", "server/db.ts", exists)).toBeNull();
  });
});

describe("buildClosures", () => {
  it("follows imports transitively", () => {
    const files = {
      "server/a.test.ts": `import { r } from "./routers/index.js";`,
      "server/routers/index.ts": `import { db } from "../db.js";`,
      "server/db.ts": `import { s } from "../drizzle/schema.js";`,
      "drizzle/schema.ts": "",
    };
    const closures = buildClosures(["server/a.test.ts"], fixture(files));

    expect(closures.get("server/a.test.ts")).toEqual(
      new Set([
        "server/a.test.ts",
        "server/routers/index.ts",
        "server/db.ts",
        "drizzle/schema.ts",
      ])
    );
  });

  it("terminates on an import cycle", () => {
    const files = {
      "server/a.test.ts": `import "./a.js";`,
      "server/a.ts": `import "./b.js";`,
      "server/b.ts": `import "./a.js";`,
    };
    const closures = buildClosures(["server/a.test.ts"], fixture(files));
    expect(closures.get("server/a.test.ts").size).toBe(3);
  });
});

describe("forcesFullSuite", () => {
  it("flags changes the import graph cannot see", () => {
    expect(forcesFullSuite("pnpm-lock.yaml")).toBe(true);
    expect(forcesFullSuite("package.json")).toBe(true);
    expect(forcesFullSuite("scripts/lib/affected.mjs")).toBe(true);
    expect(forcesFullSuite(".github/workflows/ci.yml")).toBe(true);
  });

  it("leaves ordinary source alone", () => {
    expect(forcesFullSuite("server/db.ts")).toBe(false);
  });
});

describe("selectTests", () => {
  const closures = new Map([
    ["server/db.test.ts", new Set(["server/db.test.ts", "server/db.ts"])],
    [
      "server/mail.test.ts",
      new Set(["server/mail.test.ts", "server/mailer.ts"]),
    ],
  ]);

  it("picks only the tests that reach the change", () => {
    const selection = selectTests(["server/db.ts"], closures);
    expect(selection.mode).toBe("some");
    expect(selection.tests).toEqual(["server/db.test.ts"]);
  });

  it("takes the whole suite when a lockfile changes", () => {
    const selection = selectTests(["pnpm-lock.yaml", "server/db.ts"], closures);
    expect(selection.mode).toBe("all");
    expect(selection.tests).toHaveLength(2);
  });

  it("runs a test file that is itself the change", () => {
    expect(selectTests(["server/mail.test.ts"], closures).tests).toEqual([
      "server/mail.test.ts",
    ]);
  });

  it("selects nothing when no test can reach the change", () => {
    // A client-only change: the suite is server-side, so nothing covers it.
    expect(selectTests(["client/src/pages/Trip.tsx"], closures).mode).toBe(
      "none"
    );
  });

  it("selects nothing for an empty change set", () => {
    expect(selectTests([], closures).mode).toBe("none");
  });
});
