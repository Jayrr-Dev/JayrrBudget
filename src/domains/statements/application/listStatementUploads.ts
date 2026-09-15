import type {
  StatementUploadDetail,
  StatementUploadLog,
} from "@/domains/statements/domain/types";
import { cachedConvexRead } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

export async function listStatementUploads(): Promise<
  | { ok: true; uploads: StatementUploadLog[] }
  | { ok: false; status: number; error: string }
> {
  try {
    return await cachedConvexRead({
      name: "statements.list",
      load: async () => {
        const client = await getAuthenticatedConvexClient();
        return (await client.query(api.statements.list, {})) as
          | { ok: true; uploads: StatementUploadLog[] }
          | { ok: false; status: number; error: string };
      },
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return { ok: false, status: 401, error: error.message };
    }
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list statement uploads",
    };
  }
}

export async function getStatementUpload(id: number): Promise<
  | { ok: true; upload: StatementUploadDetail }
  | { ok: false; status: number; error: string }
> {
  try {
    return await cachedConvexRead({
      name: "statements.get",
      args: { uploadId: id },
      load: async () => {
        const client = await getAuthenticatedConvexClient();
        return (await client.query(api.statements.get, { uploadId: id })) as
          | { ok: true; upload: StatementUploadDetail }
          | { ok: false; status: number; error: string };
      },
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return { ok: false, status: 401, error: error.message };
    }
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load statement upload",
    };
  }
}
