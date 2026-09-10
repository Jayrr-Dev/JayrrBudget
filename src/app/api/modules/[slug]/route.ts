import { NextResponse } from "next/server";
import { setModuleEnabled } from "@/domains/modules/application/modules";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const body = (await request.json()) as { enabled?: boolean };

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled boolean required" },
      { status: 400 },
    );
  }

  const result = await setModuleEnabled(slug, body.enabled);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
