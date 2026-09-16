// Bundle Convex-backed node:test files as ESM and run them.
// Why: `@convex-dev/auth/server` is ESM-only and tsx loads convex/*.ts as CJS,
// so importing convex mutations from a test fails to resolve. esbuild bundles
// everything as ESM and swaps the auth package for a tiny stub.
//
// Usage: node scripts/run-convex-tests.mjs scripts/piggy-transactions.test.mts
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// Keep bundles inside the repo so externalized packages resolve from node_modules.
const SCRATCH_ROOT = resolve("node_modules/.cache/convex-tests");

const AUTH_STUB = `
export async function getAuthUserId(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject.split("|")[0] ?? null;
}
`;

const authStubPlugin = {
  name: "convex-auth-stub",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@convex-dev\/auth\/server$/ }, () => ({
      path: "convex-auth-stub",
      namespace: "stub",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: AUTH_STUB,
      loader: "js",
    }));
  },
};

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Pass at least one test file.");
  process.exit(2);
}

mkdirSync(SCRATCH_ROOT, { recursive: true });
const outDir = mkdtempSync(join(SCRATCH_ROOT, "run-"));
try {
  const outputs = [];
  for (const file of files) {
    const outfile = join(outDir, basename(file).replace(/\.[cm]?ts$/, ".mjs"));
    await build({
      entryPoints: [resolve(file)],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node22",
      packages: "external",
      plugins: [authStubPlugin],
      logLevel: "warning",
    });
    outputs.push(outfile);
  }
  const result = spawnSync(process.execPath, ["--test", ...outputs], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
