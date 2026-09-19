"use client";

import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";
import { TitleInfo } from "@/domains/ops/ui/TitleInfo";
import {
  findAiPriceRow,
  formatRatePerMillion,
  formatUsd,
  utcMonthKey,
} from "@/shared/ai/aiCostTable";
import { errorMessage } from "@/shared/lib/error-message";
import { useClientNow } from "@/shared/lib/useClientNow";
import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type PlanDraft = {
  role: "admin" | "normal" | "premium";
  name: string;
  priceUsd: string;
  monthlyCapUsd: string;
  rateMax: string;
  includedCanvas: boolean;
};

function modelCostLabel(modelId: string) {
  const row = findAiPriceRow(modelId);
  if (!row || row.unit !== "tokens") return null;
  return `${formatRatePerMillion(row.inputPerMillionUsd)} in / ${formatRatePerMillion(row.outputPerMillionUsd)} out per 1M`;
}

function pctUsed(spent: number, cap: number | null) {
  if (cap == null || cap <= 0) return "—";
  return `${Math.min(999, Math.round((spent / cap) * 100))}%`;
}

function PlanCard({
  draft,
  onChange,
  onSave,
  pending,
}: {
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <article className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-semibold capitalize">{draft.role}</h3>
      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted-foreground)]">Name</span>
        <input
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          className="min-h-11 min-w-0 text-base sm:text-sm w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 outline-none focus:border-primary"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted-foreground)]">Price USD / mo</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={draft.priceUsd}
            onChange={(event) =>
              onChange({ ...draft, priceUsd: event.target.value })
            }
            className="min-h-11 min-w-0 text-base sm:text-sm w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted-foreground)]">Cap USD</span>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="blank = none"
            value={draft.monthlyCapUsd}
            onChange={(event) =>
              onChange({ ...draft, monthlyCapUsd: event.target.value })
            }
            className="min-h-11 min-w-0 text-base sm:text-sm w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 outline-none focus:border-primary"
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-[var(--muted-foreground)]">
          Requests / minute
        </span>
        <input
          type="number"
          min={1}
          max={200}
          value={draft.rateMax}
          onChange={(event) =>
            onChange({ ...draft, rateMax: event.target.value })
          }
          className="min-h-11 min-w-0 text-base sm:text-sm w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 outline-none focus:border-primary"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.includedCanvas}
          onChange={(event) =>
            onChange({ ...draft, includedCanvas: event.target.checked })
          }
        />
        Canvas included
      </label>
      <Button type="button" size="sm" disabled={pending} onClick={onSave}>
        {pending ? "Saving…" : "Save plan"}
      </Button>
    </article>
  );
}

export function ServiceAdmin() {
  const now = useClientNow();
  const monthKey = now === undefined ? undefined : utcMonthKey(now);
  const ensurePlans = useMutation(api.service.ensurePlans);
  const savePlan = useMutation(api.service.savePlan);
  const saveAiModels = useMutation(api.service.saveAiModels);
  const team = useQuery(
    api.service.teamMonth,
    monthKey ? { monthKey } : "skip",
  );
  const aiModels = useQuery(api.service.getAiModels);
  const [drafts, setDrafts] = useState<PlanDraft[]>([]);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [modelDraft, setModelDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ensurePlans({});
  }, [ensurePlans]);

  useEffect(() => {
    if (!aiModels) return;
    setModelDraft(aiModels.primaryModelId ?? aiModels.catalog[0]?.id ?? "");
  }, [aiModels]);

  useEffect(() => {
    if (!team) return;
    setDrafts(
      team.plans.map((plan) => ({
        role: plan.role,
        name: plan.name,
        priceUsd: String(plan.priceUsd),
        monthlyCapUsd:
          plan.monthlyCapUsd == null ? "" : String(plan.monthlyCapUsd),
        rateMax: String(plan.rateMax),
        includedCanvas: plan.includedCanvas,
      })),
    );
  }, [team]);

  if (team === undefined || aiModels === undefined) {
    return <PageSpinner className="min-h-40 py-8" />;
  }

  const selectedCost = modelCostLabel(modelDraft);

  return (
    <div className="space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <TitleInfo
          title="Service"
          lead="Plans, monthly app-key caps, and request rate limits."
          bullets={[
            "Cap only the app OpenRouter / OCR bill. User keys stay uncapped",
            "OCR pages cost more than chat on these flash models",
            "Premium $12 / $4 cap keeps worst-case AI COGS under a third of ARPU",
          ]}
        />
      </header>

      <section className="space-y-3">
        <TitleInfo
          heading="h2"
          title="Plans"
          lead="Free is a guardrail. Premium is the paid seat. Admin has no cap."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {drafts.map((draft) => (
            <PlanCard
              key={draft.role}
              draft={draft}
              pending={savingRole === draft.role}
              onChange={(next) =>
                setDrafts((prev) =>
                  prev.map((row) => (row.role === next.role ? next : row)),
                )
              }
              onSave={() => {
                setError(null);
                setSavingRole(draft.role);
                const capRaw = draft.monthlyCapUsd.trim();
                void savePlan({
                  role: draft.role,
                  name: draft.name,
                  priceUsd: Number(draft.priceUsd) || 0,
                  monthlyCapUsd: capRaw === "" ? null : Number(capRaw),
                  rateMax: Number(draft.rateMax) || 10,
                  rateWindowMs: 60_000,
                  includedCanvas: draft.includedCanvas,
                })
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not save plan.",
                    );
                  })
                  .finally(() => setSavingRole(null));
              }}
            />
          ))}
        </div>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <p className="text-xs text-[var(--muted-foreground)]">
          Caps are estimated USD from our rate table, not the provider invoice.
          Polar checkout is on Profile.
        </p>
      </section>

      <section className="space-y-3">
        <TitleInfo
          heading="h2"
          title="Default model"
          lead="Chat, canvas, and statement parse use this first, then the rest of the list."
          bullets={[
            "Saved in Convex, not .env",
            "Rates are OpenRouter USD per 1M tokens (input / output)",
            "Cerebras rows pin routing to Cerebras only",
            "Until you save, the server still uses OPENROUTER_MODEL",
          ]}
        />
        <div className="min-w-0 space-y-1 text-sm">
          <span className="text-muted-foreground">Primary</span>
          <div className="flex flex-wrap items-stretch gap-3">
            <select
              value={modelDraft}
              onChange={(event) => setModelDraft(event.target.value)}
              disabled={!aiModels}
              className="h-11 text-base sm:text-sm min-w-0 flex-1 rounded-md border border-control-border bg-surface-elevated px-3 outline-none focus:border-primary"
            >
              {(aiModels?.catalog ?? []).map((row) => {
                const cost = modelCostLabel(row.id);
                return (
                  <option key={row.id} value={row.id}>
                    {row.label}
                    {cost ? ` — ${cost}` : ""}
                  </option>
                );
              })}
            </select>
            <Button
              type="button"
              size="lg"
              className="h-10"
              disabled={savingModel || !modelDraft}
              onClick={() => {
                setError(null);
                setSavingModel(true);
                void saveAiModels({ primaryModelId: modelDraft })
                  .then(() => {
                    const picked = (aiModels?.catalog ?? []).find(
                      (row) => row.id === modelDraft,
                    );
                    toast.success("Default model saved", {
                      description: picked?.label ?? modelDraft,
                    });
                  })
                  .catch((err: unknown) => {
                    const message = errorMessage(err, "Could not save model.");
                    setError(message);
                    toast.error(message);
                  })
                  .finally(() => setSavingModel(false));
              }}
            >
              {savingModel ? "Saving…" : "Save model"}
            </Button>
          </div>
        </div>
        {selectedCost ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            {selectedCost}
          </p>
        ) : null}
        {aiModels?.primaryModelId == null ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            No saved pick yet. Env still wins until you save.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <TitleInfo
          heading="h2"
          title="This month"
          lead={`Platform spend vs cap for ${monthKey} UTC.`}
        />
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">App spend</th>
                <th className="px-3 py-2 font-medium">Cap</th>
                <th className="px-3 py-2 font-medium">Used</th>
                <th className="px-3 py-2 font-medium">BYOK</th>
                <th className="px-3 py-2 font-medium">Calls</th>
              </tr>
            </thead>
            <tbody>
              {team.users.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-[var(--muted-foreground)]"
                  >
                    No users yet.
                  </td>
                </tr>
              ) : (
                team.users.map((row) => (
                  <tr
                    key={row.userId}
                    className="border-b border-[var(--border)]/60 last:border-0"
                  >
                    <td className="px-3 py-2">
                      {row.email ?? row.name ?? row.userId}
                    </td>
                    <td className="px-3 py-2 capitalize">{row.role}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatUsd(row.spentUsd)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.monthlyCapUsd == null
                        ? "None"
                        : formatUsd(row.monthlyCapUsd)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {pctUsed(row.spentUsd, row.monthlyCapUsd)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatUsd(row.byokUsd)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.callCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
