import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      // The test selector decides what CI runs, so it is tested like anything else.
      "scripts/**/*.test.mjs",
      // …and the demo seeder's safety policy, which is TypeScript because
      // nothing in a deploy runs it. See scripts/seed-demo.ts.
      "scripts/**/*.test.ts",
      // Rules both sides depend on, tested where they live rather than from
      // whichever side happened to need them first.
      "shared/**/*.test.ts",
    ],
  },
});
