import { NextRequest, NextResponse } from "next/server";
import {
  getAnalysis,
  parseAnalysisRange,
} from "@/domains/analysis/application/getAnalysis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const range = parseAnalysisRange(request.nextUrl.searchParams.get("range"));
  const result = await getAnalysis(range);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
