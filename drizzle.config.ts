import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("https://");

export default defineConfig({
  schema: "./src/shared/db/schema.ts",
  out: "./drizzle",
  dialect: isRemote ? "turso" : "sqlite",
  dbCredentials: isRemote
    ? {
        url,
        authToken: authToken!,
      }
    : {
        url,
      },
});
