"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { useDashboard } from "@/domains/dashboard/ui/DashboardPanels";
import { PiggyMascot } from "@/domains/ledger-ai/ui/PiggyMascot";
import {
  needsClassify,
  useClassifyTransactions,
} from "@/domains/transactions/ui/useClassifyTransactions";
import { useConnectionState } from "@/shared/offline/useConnectionState";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const RUN_CLASSIFY_KEY = "transactions-run-classify";

function queueClassifyOnTransactions() {
  sessionStorage.setItem(RUN_CLASSIFY_KEY, "1");
}

export function ClassifyUnclassifiedNudge({
  sure,
}: {
  sure: "classify" | "go-transactions";
}) {
  const dashboard = useDashboard(null);
  const router = useRouter();
  const classify = useClassifyTransactions();
  const { isOffline } = useConnectionState();
  const pending = (dashboard.data?.transactions ?? []).filter(needsClassify);
  const [dismissed, setDismissed] = useState(false);
  const [promptReady, setPromptReady] = useState(false);

  useEffect(() => {
    if (!dashboard.data || dashboard.locked) return;

    if (sure === "classify") {
      const queued = sessionStorage.getItem(RUN_CLASSIFY_KEY) === "1";
      if (queued) {
        sessionStorage.removeItem(RUN_CLASSIFY_KEY);
        const rows = dashboard.data.transactions.filter(needsClassify);
        if (rows.length > 0) classify.mutate(rows);
        return;
      }
    }

    setPromptReady(true);
  }, [sure, dashboard.data, dashboard.locked, classify.mutate]);

  const showNudge =
    promptReady &&
    pending.length > 0 &&
    !dismissed &&
    !dashboard.locked &&
    !classify.isPending;

  function handleSure() {
    setDismissed(true);
    if (sure === "go-transactions") {
      queueClassifyOnTransactions();
      router.push("/transactions");
      return;
    }
    classify.mutate(pending);
  }

  return (
    <AlertDialog
      open={showNudge}
      onOpenChange={(open) => {
        if (!open) setDismissed(true);
      }}
    >
      <AlertDialogContent className="gap-4 sm:max-w-md">
        <AlertDialogHeader className="flex flex-row items-start gap-5 text-left">
          <PiggyMascot
            mood="happy"
            className="mt-1 shrink-0"
            iconClassName="size-16"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              Jev
            </p>
            <Bubble align="start" variant="piggy" className="max-w-full">
              <BubbleContent className="min-w-0 px-4 py-3">
                <AlertDialogTitle>
                  Do you want to classify the unclassified items?
                </AlertDialogTitle>
              </BubbleContent>
            </Bubble>
            <AlertDialogDescription className="sr-only">
              Jev is asking if you want to classify transactions that still need
              a category.
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Nah</AlertDialogCancel>
          <AlertDialogAction disabled={isOffline} onClick={handleSure}>
            Sure!
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
