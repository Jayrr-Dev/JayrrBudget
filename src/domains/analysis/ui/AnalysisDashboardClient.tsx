"use client";

import { PageSpinner } from "@/components/ui/spinner";
import dynamic from "next/dynamic";

const AnalysisDashboard = dynamic(
  () =>
    import("@/domains/analysis/ui/AnalysisDashboard").then(
      (mod) => mod.AnalysisDashboard,
    ),
  {
    ssr: false,
    loading: () => <PageSpinner />,
  },
);

export function AnalysisDashboardClient() {
  return <AnalysisDashboard />;
}
