import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** @deprecated Turso hygiene pipeline - not ported to Convex yet. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Category hygiene still targets Turso. Run legacy scripts under scripts/ against an archived DATABASE_URL, or reimplement against Convex.",
      code: "TURSO_LEGACY",
    },
    { status: 410 },
  );
}
