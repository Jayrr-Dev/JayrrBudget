import type {
  AnalysisPeriod,
  AnalysisRange,
} from "@/domains/analysis/domain/types";

export const analysisQueryKeys = {
  all: ["analysis"] as const,
  range: (range: AnalysisRange, period: AnalysisPeriod) =>
    [...analysisQueryKeys.all, range, period] as const,
};
