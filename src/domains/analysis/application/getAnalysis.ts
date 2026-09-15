import type {
  AnalysisData,
  AnalysisPeriod,
  AnalysisRange,
} from "@/domains/analysis/domain/types";
import { parseAnalysisRange } from "@/domains/analysis/domain/periods";
import { cachedConvexRead } from "@/shared/convex/cachedRead";
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
    return await cachedConvexRead({
      name: "analysis.get",
      args: { range, period },
      load: async () => {
        const client = await getAuthenticatedConvexClient();
        return (await client.action(api.analysis.get, {
          range,
          period,
        })) as GetAnalysisResult;
      },
    });
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
          : "Analysis unavailable",
    };
  }
}
