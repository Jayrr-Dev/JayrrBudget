import type { AnalysisRange } from "@/domains/analysis/domain/types";

export const analysisQueryKeys = {
  all: ["analysis"] as const,
  range: (range: AnalysisRange) =>
    [...analysisQueryKeys.all, range] as const,
};
