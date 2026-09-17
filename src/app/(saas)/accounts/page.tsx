import { PageSpinner } from "@/components/ui/spinner";
import { AccountsView } from "@/domains/dashboard/ui/AccountsView";
import { Suspense } from "react";

export default function AccountsPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AccountsView />
    </Suspense>
  );
}
