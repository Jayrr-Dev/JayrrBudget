import { NextResponse } from "next/server";
import { getSchemaGraph } from "@/domains/db-explorer/application/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const schema = await getSchemaGraph();
    return NextResponse.json({ ok: true, schema });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to load DB schema",
      },
      { status: 500 },
    );
  }
}
