import type {
  AnalysisData,
  AnalysisPeriod,
  AnalysisRange,
} from "@/domains/analysis/domain/types";
import { parseAnalysisRange } from "@/domains/analysis/domain/periods";
import { api } from "@/shared/convex/httpClient";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

export type GetAnalysisResult =
  | { ok: true; data: AnalysisData }
  | { ok: false; status: number; error: string };

export { parseAnalysisRange };

export async function getAnalysis(
  range: AnalysisRange = "12m",
  period: AnalysisPeriod = "monthly",
): Promise<GetAnalysisResult> {
  try {
    const client = await getAuthenticatedConvexClient();
    const result = await client.query(api.analysis.get, { range, period });
    return result as GetAnalysisResult;
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return { ok: false, status: 401, error: error.message };
    }
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Convex analysis unavailable",
    };
  }
}
