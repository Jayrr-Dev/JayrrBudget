"use client";

import type {
  AnalysisPeriod,
  AnalysisRange,
} from "@/domains/analysis/domain/types";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { readAnalysisUiPrefs } from "@/domains/analysis/ui/analysisUiPrefs";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";

type LedgerGate = {
  unlocked: boolean;
  loading: boolean;
  version: number;
  txnCount: number;
};

export function analysisCacheKey(
  range: AnalysisRange,
  period: AnalysisPeriod,
  ledger: Pick<LedgerGate, "version" | "txnCount">,
) {
  return [
    ...analysisQueryKeys.range(range, period),
    "vault",
    ledger.version,
    ledger.txnCount,
  ] as const;
}

function analysisEnabled(ledger: LedgerGate) {
  return ledger.unlocked && !ledger.loading;
}

async function analysisFromUnlockedLedger(
  ledger: PrivateLedger,
  range: AnalysisRange,
  period: AnalysisPeriod,
) {
  const { analysisFromPrivateLedger } =
    await import("@/domains/vault/application/analysisFromPrivateLedger");
  return analysisFromPrivateLedger(ledger, range, period);
}

export function useAnalysis(range: AnalysisRange, period: AnalysisPeriod) {
  const privateLedger = usePrivateLedger();
  const ledger: LedgerGate = {
    unlocked: privateLedger.unlocked,
    loading: privateLedger.loading,
    version: privateLedger.version,
    txnCount: privateLedger.ledger.transactions.length,
  };
  const query = useQuery({
    queryKey: analysisCacheKey(range, period, ledger),
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 30 * 60_000,
    enabled: analysisEnabled(ledger),
    queryFn: async () => {
      return analysisFromUnlockedLedger(privateLedger.ledger, range, period);
    },
  });
  return {
    data: query.data,
    isPending:
      query.isPending || privateLedger.loading || !privateLedger.unlocked,
    isError: query.isError || Boolean(privateLedger.error),
    isFetching: query.isFetching,
    error:
      query.error instanceof Error
        ? query.error
        : privateLedger.error
          ? new Error(privateLedger.error)
          : null,
    encryptedLedger: true as const,
    locked: !privateLedger.unlocked,
  };
}

/** Hover / focus prefetch so /analysis can hit cache. */
export function usePrefetchAnalysis() {
  const queryClient = useQueryClient();
  const privateLedger = usePrivateLedger();

  return useCallback(() => {
    const ledger: LedgerGate = {
      unlocked: privateLedger.unlocked,
      loading: privateLedger.loading,
      version: privateLedger.version,
      txnCount: privateLedger.ledger.transactions.length,
    };
    if (!analysisEnabled(ledger)) return;

    const prefs = readAnalysisUiPrefs();
    void queryClient.prefetchQuery({
      queryKey: analysisCacheKey(prefs.range, prefs.period, ledger),
      staleTime: 0,
      queryFn: async () => {
        return analysisFromUnlockedLedger(
          privateLedger.ledger,
          prefs.range,
          prefs.period,
        );
      },
    });
  }, [privateLedger, queryClient]);
}
