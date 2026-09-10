import { NextResponse } from "next/server";
import { getStatementUpload } from "@/domains/statements/application/listStatementUploads";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = Number(rawId);

  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid upload id." }, { status: 400 });
  }

  const result = await getStatementUpload(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, upload: result.upload });
}
