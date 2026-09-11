import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  const onVercel = Boolean(process.env.VERCEL);

  if (!url) {
    if (onVercel) {
      throw new Error(
        "DATABASE_URL is missing on Vercel. Set it to your Turso libsql:// URL.",
      );
    }
    return "file:./data/jayrr-budget.db";
  }

  if (onVercel && (url.startsWith("file:") || url.includes("./data/"))) {
    throw new Error(
      "DATABASE_URL points at a local SQLite file on Vercel. Use a Turso libsql:// URL.",
    );
  }

  return url;
}

function isRemoteUrl(url: string) {
  return url.startsWith("libsql://") || url.startsWith("https://");
}

const globalForDb = globalThis as unknown as {
  libsql?: ReturnType<typeof createClient>;
  libsqlUrl?: string;
};

function createDbClient() {
  const url = getDatabaseUrl();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();

  if (isRemoteUrl(url) && !authToken) {
    throw new Error(
      "DATABASE_AUTH_TOKEN required when DATABASE_URL points at Turso.",
    );
  }

  return createClient({
    url,
    timeout: 60_000,
    ...(authToken ? { authToken } : {}),
  });
}

export function getDb() {
  const url = getDatabaseUrl();

  if (!globalForDb.libsql || globalForDb.libsqlUrl !== url) {
    globalForDb.libsql = createDbClient();
    globalForDb.libsqlUrl = url;
  }

  return drizzle(globalForDb.libsql, { schema });
}

export type Database = ReturnType<typeof getDb>;

export function isUsingTurso() {
  return isRemoteUrl(getDatabaseUrl());
}
