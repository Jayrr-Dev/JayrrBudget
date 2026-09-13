import { parseAnalysisRange } from "@/domains/analysis/application/getAnalysis";
import { parseAnalysisPeriod } from "@/domains/analysis/domain/periods";
import type {
  AnalysisPeriod,
  AnalysisRange,
} from "@/domains/analysis/domain/types";

const STORAGE_KEY = "jayrr-budget.analysis-ui";

export type AnalysisTab =
  | "main"
  | "sections"
  | "spreads"
  | "categories"
  | "subcategories"
  | "tags"
  | "types"
  | "merchants"
  | "patterns";

export type FacetPane = "visualizations" | "summary" | "average" | "range";

export type AnalysisUiPrefs = {
  range: AnalysisRange;
  period: AnalysisPeriod;
  tab: AnalysisTab;
  pane: FacetPane;
  category: string;
  subcategory: string;
  tag: string;
  type: string;
  merchant: string;
};

export const DEFAULT_ANALYSIS_UI_PREFS: AnalysisUiPrefs = {
  range: "12m",
  period: "monthly",
  tab: "main",
  pane: "visualizations",
  category: "",
  subcategory: "",
  tag: "",
  type: "",
  merchant: "",
};

const TABS = new Set<AnalysisTab>([
  "main",
  "sections",
  "spreads",
  "categories",
  "subcategories",
  "tags",
  "types",
  "merchants",
  "patterns",
]);

const PANES = new Set<FacetPane>([
  "visualizations",
  "summary",
  "average",
  "range",
]);

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function parseAnalysisTab(value: unknown): AnalysisTab {
  return typeof value === "string" && TABS.has(value as AnalysisTab)
    ? (value as AnalysisTab)
    : DEFAULT_ANALYSIS_UI_PREFS.tab;
}

export function parseFacetPane(value: unknown): FacetPane {
  return typeof value === "string" && PANES.has(value as FacetPane)
    ? (value as FacetPane)
    : DEFAULT_ANALYSIS_UI_PREFS.pane;
}

export function readAnalysisUiPrefs(): AnalysisUiPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_ANALYSIS_UI_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ANALYSIS_UI_PREFS };
    const parsed = JSON.parse(raw) as Partial<AnalysisUiPrefs>;
    return {
      range: parseAnalysisRange(
        typeof parsed.range === "string" ? parsed.range : null,
      ),
      period: parseAnalysisPeriod(
        typeof parsed.period === "string" ? parsed.period : null,
      ),
      tab: parseAnalysisTab(parsed.tab),
      pane: parseFacetPane(parsed.pane),
      category: asString(parsed.category),
      subcategory: asString(parsed.subcategory),
      tag: asString(parsed.tag),
      type: asString(parsed.type),
      merchant: asString(parsed.merchant),
    };
  } catch {
    return { ...DEFAULT_ANALYSIS_UI_PREFS };
  }
}

export function writeAnalysisUiPrefs(prefs: AnalysisUiPrefs) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}
