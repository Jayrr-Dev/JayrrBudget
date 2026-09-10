import { NextResponse } from "next/server";
import { runCategoryHygienePipeline } from "@/domains/statements/application/runCategoryHygienePipeline";
import { isOpenRouterConfigured } from "@/shared/ai/openRouter";
import { errorMessage } from "@/shared/lib/error-message";

export const runtime = "nodejs";
export const maxDuration = 300;

/** @deprecated Prefer POST /api/transactions/clean-categories */
export async function POST() {
  if (!isOpenRouterConfigured()) {
    return NextResponse.json(
      {
        error: "Missing OPENROUTER_API_KEY. Add it to .env.local.",
        code: "OPENROUTER_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  try {
    const result = await runCategoryHygienePipeline();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Category consolidate failed") },
      { status: 500 },
    );
  }
}
