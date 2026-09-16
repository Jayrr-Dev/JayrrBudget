"use client";

import type {
  AnalysisData,
  AnalysisPeriod,
  AnalysisRange,
} from "@/domains/analysis/domain/types";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { readAnalysisUiPrefs } from "@/domains/analysis/ui/analysisUiPrefs";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useCallback } from "react";

type LedgerGate = {
  encryptedLedger: boolean;
  unlocked: boolean;
  loading: boolean;
  version: number;
  txnCount: number;
};

export function analysisCacheKey(
  range: AnalysisRange,
  period: AnalysisPeriod,
  ledger: Pick<LedgerGate, "encryptedLedger" | "version" | "txnCount">,
) {
  if (!ledger.encryptedLedger) {
    return analysisQueryKeys.range(range, period);
  }
  return [
    ...analysisQueryKeys.range(range, period),
    "vault",
    ledger.version,
    ledger.txnCount,
  ] as const;
}

function analysisEnabled(ledger: LedgerGate) {
  return !ledger.encryptedLedger || (ledger.unlocked && !ledger.loading);
}

async function analysisFromUnlockedLedger(
  ledger: PrivateLedger,
  range: AnalysisRange,
  period: AnalysisPeriod,
) {
  const { analysisFromPrivateLedger } = await import(
    "@/domains/vault/application/analysisFromPrivateLedger"
  );
  return analysisFromPrivateLedger(ledger, range, period);
}

export function useAnalysis(range: AnalysisRange, period: AnalysisPeriod) {
  const getAnalysis = useAction(api.analysis.get);
  const privateLedger = usePrivateLedger();
  const ledger: LedgerGate = {
    encryptedLedger: privateLedger.encryptedLedger,
    unlocked: privateLedger.unlocked,
    loading: privateLedger.loading,
    version: privateLedger.version,
    txnCount: privateLedger.ledger.transactions.length,
  };
  const query = useQuery({
    queryKey: analysisCacheKey(range, period, ledger),
    placeholderData: keepPreviousData,
    staleTime: ledger.encryptedLedger ? 0 : 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: analysisEnabled(ledger),
    queryFn: async () => {
      if (ledger.encryptedLedger) {
        return analysisFromUnlockedLedger(privateLedger.ledger, range, period);
      }
      const res = await getAnalysis({ range, period });
      if (!res || !("ok" in res) || res.ok !== true) {
        const message =
          res && "error" in res ? String(res.error) : "Analysis failed";
        throw new Error(message);
      }
      return res.data as AnalysisData;
    },
  });
  return {
    data: query.data,
    isPending:
      query.isPending ||
      (privateLedger.encryptedLedger &&
        (privateLedger.loading || !privateLedger.unlocked)),
    isError:
      query.isError ||
      Boolean(privateLedger.encryptedLedger && privateLedger.error),
    isFetching: query.isFetching,
    error:
      query.error instanceof Error
        ? query.error
        : privateLedger.error
          ? new Error(privateLedger.error)
          : null,
    encryptedLedger: privateLedger.encryptedLedger,
    locked: privateLedger.encryptedLedger && !privateLedger.unlocked,
  };
}

/** Hover / focus prefetch so /analysis can hit cache. */
export function usePrefetchAnalysis() {
  const getAnalysis = useAction(api.analysis.get);
  const queryClient = useQueryClient();
  const privateLedger = usePrivateLedger();

  return useCallback(() => {
    const ledger: LedgerGate = {
      encryptedLedger: privateLedger.encryptedLedger,
      unlocked: privateLedger.unlocked,
      loading: privateLedger.loading,
      version: privateLedger.version,
      txnCount: privateLedger.ledger.transactions.length,
    };
    if (!analysisEnabled(ledger)) return;

    const prefs = readAnalysisUiPrefs();
    void queryClient.prefetchQuery({
      queryKey: analysisCacheKey(prefs.range, prefs.period, ledger),
      staleTime: ledger.encryptedLedger ? 0 : 5 * 60_000,
      queryFn: async () => {
        if (ledger.encryptedLedger) {
          return analysisFromUnlockedLedger(
            privateLedger.ledger,
            prefs.range,
            prefs.period,
          );
        }
        const res = await getAnalysis({
          range: prefs.range,
          period: prefs.period,
        });
        if (!res || !("ok" in res) || res.ok !== true) {
          const message =
            res && "error" in res ? String(res.error) : "Analysis failed";
          throw new Error(message);
        }
        return res.data as AnalysisData;
      },
    });
  }, [getAnalysis, privateLedger, queryClient]);
}
