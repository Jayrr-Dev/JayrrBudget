import { NextResponse } from "next/server";
import {
  browseTable,
  isDbTableName,
} from "@/domains/db-explorer/application/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ name: string }>;
};

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
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to browse table",
      },
      { status: 500 },
    );
  }
}
