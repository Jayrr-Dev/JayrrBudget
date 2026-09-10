import { parseJson } from "@/shared/lib/parse-json";
import type {
  AnalysisData,
  AnalysisRange,
} from "@/domains/analysis/domain/types";

export async function fetchAnalysis(range: AnalysisRange = "12m") {
  const response = await fetch(`/api/analysis?range=${range}`, {
    cache: "no-store",
  });
  return parseJson<AnalysisData>(response);
}
