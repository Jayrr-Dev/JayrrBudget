"use client";

import { PageSpinner } from "@/components/ui/spinner";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PageSpinner />;
  }

  return <AnalysisDashboard />;
}
