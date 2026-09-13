import { config } from "dotenv";
import { readFileSync } from "node:fs";

const raw = readFileSync(".env.local", "utf8");
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    if (trimmed.startsWith("#") && /DATABASE|TURSO|libsql|file:/.test(trimmed)) {
      console.log("comment", trimmed.replace(/=.*/, "=…"));
    }
    continue;
  }
  const eq = trimmed.indexOf("=");
  const key = eq >= 0 ? trimmed.slice(0, eq) : trimmed;
  const val = eq >= 0 ? trimmed.slice(eq + 1) : "";
  const unquoted = val.replace(/^["']|["']$/g, "");
  if (key.includes("URL") || key.includes("TOKEN") || key.includes("DATABASE")) {
    console.log(
      key,
      unquoted.startsWith("libsql://")
        ? "libsql"
        : unquoted.startsWith("file:")
          ? `file:${unquoted.slice(5, 40)}`
          : unquoted.startsWith("https://")
            ? "https"
            : `len=${unquoted.length} prefix=${unquoted.slice(0, 12)}`,
    );
  } else {
    console.log(key, "set");
  }
}

config({ path: ".env.local" });
console.log(
  "resolved DATABASE_URL protocol",
  process.env.DATABASE_URL?.split(":")[0],
);
