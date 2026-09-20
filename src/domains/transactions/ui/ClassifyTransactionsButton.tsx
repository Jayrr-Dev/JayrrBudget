"use client";

import { Button } from "@/components/ui/button";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";
import {
  needsClassify,
  useClassifyTransactions,
} from "@/domains/transactions/ui/useClassifyTransactions";
import { useConnectionState } from "@/shared/offline/useConnectionState";

export function ClassifyTransactionsButton({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) {
  const { isOffline } = useConnectionState();
  const pending = transactions.filter(needsClassify);
  const classify = useClassifyTransactions();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending.length === 0 || classify.isPending || isOffline}
      onClick={() => classify.mutate(pending)}
    >
      {classify.isPending
        ? "Classifying…"
        : pending.length > 1
          ? `Classify ${pending.length}`
          : "Classify"}
    </Button>
  );
}
