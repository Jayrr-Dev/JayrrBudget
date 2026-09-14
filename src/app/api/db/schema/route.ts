import { NextResponse } from "next/server";
import { getSchemaGraph } from "@/domains/db-explorer/application/schema";
import { AuthRequiredError } from "@/shared/convex/httpClient.server";
import { errorMessage } from "@/shared/lib/error-message";

export const runtime = "nodejs";

function statusForError(error: unknown): number {
  if (error instanceof AuthRequiredError) return 401;
  const message = errorMessage(error).toLowerCase();
  if (message.includes("admin access required")) return 403;
  if (message.includes("not authenticated")) return 401;
  return 500;
}

export async function GET() {
  try {
    const schema = await getSchemaGraph();
    return NextResponse.json({ ok: true, schema });
  } catch (error) {
    const status = statusForError(error);
    return NextResponse.json(
      {
        ok: false,
        error:
          status === 403
            ? "Admin access required"
            : status === 401
              ? "Authentication required"
              : errorMessage(error, "Failed to load DB schema"),
      },
      { status },
    );
  }
}
