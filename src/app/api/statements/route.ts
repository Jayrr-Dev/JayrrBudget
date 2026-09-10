import { NextResponse } from "next/server";
import { listStatementUploads } from "@/domains/statements/application/listStatementUploads";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await listStatementUploads();

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, uploads: result.uploads });
}
