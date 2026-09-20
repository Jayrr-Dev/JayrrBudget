"use client";

import { PageSpinner } from "@/components/ui/spinner";
import { ClassifyUnclassifiedNudge } from "@/domains/transactions/ui/ClassifyUnclassifiedNudge";
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

  return (
    <>
      <ClassifyUnclassifiedNudge sure="go-transactions" />
      <AnalysisDashboard />
    </>
  );
}
