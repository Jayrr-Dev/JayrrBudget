"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";
import {
  needsClassify,
  useClassifyProgress,
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
  const progress = useClassifyProgress();
  const busy = classify.isPending || progress !== null;

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending.length === 0 || busy || isOffline}
      onClick={() => classify.mutate(pending)}
    >
      {busy ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          <span className="tabular-nums">
            {progress
              ? `${progress.done} of ${progress.total}`
              : "Classifying…"}
          </span>
        </span>
      ) : pending.length > 1 ? (
        `Classify ${pending.length}`
      ) : (
        "Classify"
      )}
    </Button>
  );
}
