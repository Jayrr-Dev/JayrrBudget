/**
 * Legacy Turso / Drizzle entry — **not** used by the live Next app.
 * Live reads/writes go through Convex (`NEXT_PUBLIC_CONVEX_URL`).
 * Kept so one-off scripts under `scripts/` can still load `.env.local` Turso
 * credentials when intentionally auditing the archived remote.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The live app uses Convex (NEXT_PUBLIC_CONVEX_URL). " +
        "Only legacy scripts need Turso credentials in .env.local.",
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

/** @deprecated Live app uses Convex. Legacy scripts only. */
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

/** @deprecated Live app uses Convex. Legacy scripts only. */
export function getDb() {
  return drizzle(getLibsqlClient(), { schema });
}

export type Database = ReturnType<typeof getDb>;

export function isUsingTurso() {
  return isRemoteUrl(getDatabaseUrl());
}
