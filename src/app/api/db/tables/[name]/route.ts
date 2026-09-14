import { NextResponse } from "next/server";
import {
  browseTable,
  isDbTableName,
} from "@/domains/db-explorer/application/schema";
import { AuthRequiredError } from "@/shared/convex/httpClient.server";
import { errorMessage } from "@/shared/lib/error-message";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ name: string }>;
};

function statusForError(error: unknown): number {
  if (error instanceof AuthRequiredError) return 401;
  const message = errorMessage(error).toLowerCase();
  if (message.includes("admin access required")) return 403;
  if (message.includes("not authenticated")) return 401;
  return 500;
}

export async function GET(request: Request, context: RouteContext) {
  const { name } = await context.params;
  if (!isDbTableName(name)) {
    return NextResponse.json(
      { ok: false, error: "Unknown table" },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "50");
  const offset = Number(searchParams.get("offset") ?? "0");

  try {
    const data = await browseTable(
      name,
      Number.isFinite(limit) ? limit : 50,
      Number.isFinite(offset) ? offset : 0,
    );
    return NextResponse.json({ ok: true, data });
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
              : errorMessage(error, "Failed to browse table"),
      },
      { status },
    );
  }
}
