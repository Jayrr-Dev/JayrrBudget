import { api } from "@/shared/convex/httpClient";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

export type DeleteStatementUploadResult =
  | {
      ok: true;
      filename: string;
      deletedTransactions: number;
    }
  | { ok: false; status: number; error: string };

/** Remove an owned statement upload and every transaction linked to it. */
export async function deleteStatementUpload(
  id: number,
): Promise<DeleteStatementUploadResult> {
  try {
    const client = await getAuthenticatedConvexClient();
    return (await client.mutation(api.statements.remove, {
      uploadId: id,
    })) as DeleteStatementUploadResult;
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
          : "Failed to delete statement upload",
    };
  }
}
