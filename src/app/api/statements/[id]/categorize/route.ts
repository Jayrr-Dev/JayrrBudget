import { categorizeStatement } from "@/domains/statements/application/categorizeStatement";
import { AuthRequiredError, getAuthenticatedConvexClient } from "@/shared/convex/httpClient.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const client = await getAuthenticatedConvexClient();
    const { id } = await context.params;
    const uploadId = Number(id);
    if (!Number.isSafeInteger(uploadId) || uploadId < 1) {
      return Response.json({ error: "Invalid statement" }, { status: 400 });
    }
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    return Response.json(
      await categorizeStatement(client, uploadId, { force: body.force === true }),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Categorization failed" },
      { status: error instanceof AuthRequiredError ? 401 : 500 },
    );
  }
}
