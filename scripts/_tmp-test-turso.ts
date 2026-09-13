import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";

const raw = readFileSync(".env.local", "utf8");
let fileUrl: string | null = null;
let tursoUrl: string | null = null;
let tursoToken: string | null = null;

for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  const m = t.match(/^#?\s*(DATABASE_URL|DATABASE_AUTH_TOKEN)\s*=\s*(.*)$/);
  if (!m) continue;
  const key = m[1];
  const val = m[2].replace(/^["']|["']$/g, "");
  if (key === "DATABASE_URL") {
    if (val.startsWith("file:")) fileUrl = val;
    if (val.startsWith("libsql://")) tursoUrl = val;
  }
  if (key === "DATABASE_AUTH_TOKEN" && val.length > 10) tursoToken = val;
}

console.log(
  JSON.stringify(
    {
      hasFileUrl: Boolean(fileUrl),
      hasTursoUrl: Boolean(tursoUrl),
      hasTursoToken: Boolean(tursoToken),
      tursoHost: tursoUrl
        ? `${tursoUrl.replace(/^libsql:\/\//, "").split(".")[0].slice(0, 8)}…`
        : null,
    },
    null,
    2,
  ),
);

if (!tursoUrl || !tursoToken) {
  console.log("MISSING_TURSO_CREDS");
  process.exit(2);
}

async function main() {
  const db = createClient({ url: tursoUrl!, authToken: tursoToken! });
  const info = await db.execute("PRAGMA table_info(transactions)");
  const cols = info.rows.map((r) => String(r.name));
  console.log("turso_col_count", cols.length);
  console.log("has_posted", cols.includes("posted"));
  console.log("has_amount", cols.includes("amount"));
  console.log("has_merchant_clean", cols.includes("merchant_clean"));
  const cnt = await db.execute("SELECT COUNT(*) AS c FROM transactions");
  console.log("turso_count", cnt.rows[0]?.c);
  try {
    await db.execute({
      sql: "select id, posted, amount from transactions order by posted desc, id desc limit ?",
      args: [3],
    });
    console.log("turso_select_ok");
  } catch (e) {
    console.error("turso_select_failed", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
