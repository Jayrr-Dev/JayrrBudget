import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
  console.log("url_ok", url.startsWith("libsql://"));
  console.log("token_len", authToken?.length ?? 0);

  const c = createClient({ url, authToken, timeout: 30_000 });
  try {
    const r = await c.execute(
      "select institution_id, name from institutions limit 1",
    );
    console.log("ok", r.rows.length);
  } catch (e) {
    const err = e as Error & { code?: string; cause?: { status?: number } };
    console.error("fail", err.code ?? err.name, err.message);
    if (err.cause && typeof err.cause === "object" && "status" in err.cause) {
      console.error("http", (err.cause as { status?: number }).status);
    }
  }
}

main();
