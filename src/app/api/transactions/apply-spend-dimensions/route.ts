import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** @deprecated Turso spend-dimensions pipeline. */
export async function POST() {
  return NextResponse.json(
    {
      error: "apply-spend-dimensions is retired with the Turso pipeline.",
      code: "TURSO_LEGACY",
    },
    { status: 410 },
  );
}
