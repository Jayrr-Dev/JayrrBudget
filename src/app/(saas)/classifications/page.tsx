import { PageSpinner } from "@/components/ui/spinner";
import { ClassificationsPanel } from "@/domains/classifications/ui/ClassificationsPanel";
import { Suspense } from "react";

export default function ClassificationsPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ClassificationsPanel />
    </Suspense>
  );
}
