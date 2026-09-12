import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  const onVercel = Boolean(process.env.VERCEL);

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add Turso credentials to .env.local (see .env.example). " +
        "Do not use archived SQLite under archive/db/ — see archive/db/README.md.",
    );
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
  libsqlAuthToken?: string;
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

export function getLibsqlClient() {
  const url = getDatabaseUrl();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() ?? "";

  if (
    !globalForDb.libsql ||
    globalForDb.libsqlUrl !== url ||
    globalForDb.libsqlAuthToken !== authToken
  ) {
    globalForDb.libsql = createDbClient();
    globalForDb.libsqlUrl = url;
    globalForDb.libsqlAuthToken = authToken;
  }

  return globalForDb.libsql;
}

export function getDb() {
  return drizzle(getLibsqlClient(), { schema });
}

export type Database = ReturnType<typeof getDb>;

export function isUsingTurso() {
  return isRemoteUrl(getDatabaseUrl());
}
