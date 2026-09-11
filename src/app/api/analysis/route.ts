import { NextRequest, NextResponse } from "next/server";
import {
  getAnalysis,
  parseAnalysisRange,
} from "@/domains/analysis/application/getAnalysis";
import { parseAnalysisPeriod } from "@/domains/analysis/domain/periods";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const range = parseAnalysisRange(request.nextUrl.searchParams.get("range"));
  const period = parseAnalysisPeriod(request.nextUrl.searchParams.get("period"));
  const result = await getAnalysis(range, period);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
