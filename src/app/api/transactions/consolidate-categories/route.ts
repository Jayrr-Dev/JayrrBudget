import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** @deprecated Prefer POST /api/transactions/clean-categories - both retired. */
export async function POST() {
  return NextResponse.json(
    {
      error: "Consolidate categories is retired with the Turso pipeline.",
      code: "TURSO_LEGACY",
    },
    { status: 410 },
  );
}
