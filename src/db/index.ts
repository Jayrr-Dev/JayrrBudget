import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db";
}

const globalForDb = globalThis as unknown as {
  libsql?: ReturnType<typeof createClient>;
};

function createDbClient() {
  const url = getDatabaseUrl();
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  return createClient({
    url,
    ...(authToken ? { authToken } : {}),
  });
}

export function getDb() {
  const client = globalForDb.libsql ?? createDbClient();

  if (process.env.NODE_ENV !== "production") {
    globalForDb.libsql = client;
  }

  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof getDb>;
