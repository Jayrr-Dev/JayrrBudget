import { NextResponse } from "next/server";
import { listAppModules } from "@/domains/modules/application/modules";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const enabledOnly = searchParams.get("enabled") === "1";

  try {
    const modules = await listAppModules({ enabledOnly });
    return NextResponse.json({ ok: true, modules });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to load modules",
      },
      { status: 500 },
    );
  }
}
