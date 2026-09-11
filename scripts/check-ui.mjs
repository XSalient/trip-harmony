#!/usr/bin/env node
/**
 * The gate the UI work runs behind: type-check, build, tests, token contrast,
 * design-system drift. One command, one exit code.
 *
 * It exists because the obvious shell form lies:
 *
 *     npx vite build --logLevel error 2>&1 | tail -3 && echo BUILD_OK
 *
 * A pipeline's status is its *last* command's, so `tail` succeeding printed
 * BUILD_OK over a failed build, and `--logLevel error` hid the one line that
 * said so. A broken JSX comment got committed that way. Every step here is run
 * unpiped and its status is checked.
 *
 *     node scripts/check-ui.mjs
 */
import { spawnSync } from "node:child_process";

const steps = [
  ["types", "npx", ["tsc", "--noEmit"]],
  ["build", "npx", ["vite", "build", "--logLevel", "warn"]],
  ["tests", "npx", ["vitest", "run", "--reporter=dot"]],
  ["tokens", "python", ["verify_tokens.py"], "design-system"],
  ["drift", "python", ["check_consistency.py"], "design-system"],
];

let failed = 0;

for (const [name, cmd, args, cwd] of steps) {
  process.stdout.write(`${name.padEnd(7)} `);
  const run = spawnSync(cmd, args, {
    cwd,
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  if (run.status === 0) {
    console.log("ok");
  } else {
    failed++;
    console.log("FAILED");
    // The first lines are the ones that say why; the rest is a stack.
    console.log(
      out
        .split("\n")
        .filter(Boolean)
        .slice(0, 12)
        .map(l => `        ${l}`)
        .join("\n")
    );
  }
}

process.exit(failed ? 1 : 0);
