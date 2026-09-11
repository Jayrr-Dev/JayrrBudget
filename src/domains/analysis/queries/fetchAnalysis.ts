import { parseJson } from "@/shared/lib/parse-json";
import type {
  AnalysisData,
  AnalysisPeriod,
  AnalysisRange,
} from "@/domains/analysis/domain/types";

export async function fetchAnalysis(
  range: AnalysisRange = "12m",
  period: AnalysisPeriod = "monthly",
) {
  const response = await fetch(
    `/api/analysis?range=${range}&period=${period}`,
    {
      cache: "no-store",
    },
  );
  return parseJson<AnalysisData>(response);
}
