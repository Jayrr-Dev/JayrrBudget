import { build } from "esbuild";
import { execFileSync } from "node:child_process";

for (const suite of ["backend", "pipeline"]) {
  const outfile = `node_modules/.cache/categorization-${suite}.test.mjs`;
  await build({ entryPoints: [`scripts/categorization-${suite}.test.ts`], bundle: true,
    platform: "node", format: "esm", packages: "external", outfile,
    ...(suite === "pipeline" ? { alias: { "@/shared/ai/openRouter": "./scripts/categorization-ai.fixture.ts" } } : {}),
  });
  execFileSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
}
execFileSync(process.execPath, ["--experimental-strip-types", "--test", "scripts/categorization.test.mjs"], { stdio: "inherit" });
