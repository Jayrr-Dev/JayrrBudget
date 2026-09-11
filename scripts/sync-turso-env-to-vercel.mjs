/**
 * Remove + re-add DATABASE_URL / DATABASE_AUTH_TOKEN on Vercel from .env.local.
 * Usage: node scripts/sync-turso-env-to-vercel.mjs
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.DATABASE_URL?.trim();
const token = process.env.DATABASE_AUTH_TOKEN?.trim();

if (!url?.startsWith("libsql://") || !token?.startsWith("eyJ")) {
  console.error("Local .env.local missing valid Turso DATABASE_URL / DATABASE_AUTH_TOKEN");
  process.exit(1);
}

const targets = ["production", "preview", "development"];

function run(args, input) {
  const result = spawnSync("vercel", args, {
    input,
    encoding: "utf8",
    shell: true,
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { status: result.status ?? 1, out };
}

for (const target of targets) {
  for (const name of ["DATABASE_URL", "DATABASE_AUTH_TOKEN"]) {
    // Remove may fail if missing — ignore.
    run(["env", "rm", name, target, "--yes"]);
  }
}

for (const target of targets) {
  for (const [name, value] of [
    ["DATABASE_URL", url],
    ["DATABASE_AUTH_TOKEN", token],
  ]) {
    const file = join(tmpdir(), `vercel-${name}-${target}.txt`);
    writeFileSync(file, value, "utf8");
    // vercel env add reads value from stdin
    const result = run(["env", "add", name, target], value);
    unlinkSync(file);
    const ok = result.status === 0 && !/error/i.test(result.out);
    console.log(`${name} → ${target}: ${ok ? "ok" : "FAIL"}`);
    if (!ok) {
      console.log(result.out.slice(-400));
    }
  }
}

console.log("done — redeploy production next");
