"use client";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { budgetPingCopy } from "@/domains/piggy-pings/domain/budgetPingCopy";
import {
  budgetOverTrigger,
  budgetPingTrigger,
  budgetWarnOverTrigger,
  budgetWarnTrigger,
} from "@/domains/piggy-pings/domain/budgetPingTrigger";
import {
  DEFAULT_PING_TYPES,
  PING_TYPES,
  pingTypeLabel,
  togglePingType,
  NONE_CYCLE,
  type PingType,
} from "@/domains/piggy-pings/domain/types";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export type BudgetPingLinkDraft = {
  pingId: Id<"piggyPings">;
  warn: boolean;
  over: boolean;
};

type PingOption = {
  value: Id<"piggyPings">;
  name: string;
  trigger: string | null;
};

type Props = {
  budgetName: string;
  links: BudgetPingLinkDraft[];
  disabled?: boolean;
  onChange: (next: BudgetPingLinkDraft[]) => void;
};

export function BudgetPingLinksField({
  budgetName,
  links,
  disabled,
  onChange,
}: Props) {
  const pings = useQuery(api.piggyPings.list, {});
  const createPing = useMutation(api.piggyPings.create);
  const anchor = useComboboxAnchor();
  const [pingTypes, setPingTypes] = useState<PingType[]>(DEFAULT_PING_TYPES);

  const options = useMemo((): PingOption[] => {
    if (!pings) return [];
    return pings.map((ping) => ({
      value: ping.id,
      name: ping.name,
      trigger: ping.trigger,
    }));
  }, [pings]);

  const selected = useMemo(() => {
    return links
      .map((link) => options.find((option) => option.value === link.pingId))
      .filter((option): option is PingOption => option != null);
  }, [links, options]);

  function upsertLink(
    pingId: Id<"piggyPings">,
    warn: boolean,
    over: boolean,
  ) {
    const next = links.filter((link) => link.pingId !== pingId);
    if (!warn && !over) {
      onChange(next);
      return;
    }
    onChange([...next, { pingId, warn, over }]);
  }

  async function createLinkedPing(warn: boolean, over: boolean) {
    const name = budgetName.trim();
    if (!name) {
      toast.error("Name the budget first");
      return;
    }
    const trigger = budgetPingTrigger(name, warn, over);
    const copy = budgetPingCopy(name, warn, over);
    try {
      const ping = await createPing({
        name: trigger.slice(0, 80),
        title: copy.title,
        message: copy.message,
        pingTypes,
        cycle: NONE_CYCLE,
        trigger,
        isActive: true,
      });
      onChange([
        ...links.filter((link) => link.pingId !== ping.id),
        { pingId: ping.id, warn, over },
      ]);
      toast.success(`Created ${trigger}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create ping");
    }
  }

  return (
    <div className="grid gap-2">
      <Combobox
        items={options}
        multiple
        value={selected}
        disabled={disabled || pings === undefined}
        itemToStringLabel={(item) => item.name}
        isItemEqualToValue={(a, b) => a.value === b.value}
        onValueChange={(next) => {
          const picked = new Set(next.map((item) => item.value));
          const kept = links.filter((link) => picked.has(link.pingId));
          const added = next.filter(
            (item) => !links.some((link) => link.pingId === item.value),
          );
          onChange([
            ...kept,
            ...added.map((item) => ({
              pingId: item.value,
              warn: true,
              over: false,
            })),
          ]);
        }}
      >
        <ComboboxChips ref={anchor} className="w-full min-w-0">
          <ComboboxValue>
            {selected.map((item) => (
              <ComboboxChip key={item.value} title={item.name}>
                <span className="min-w-0 truncate">{item.name}</span>
              </ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            placeholder="Link existing pings…"
            disabled={disabled || pings === undefined}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor} className="z-60">
          <ComboboxEmpty>No pings yet.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.value} value={item}>
                <span className="min-w-0 truncate">{item.name}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {links.length > 0 ? (
        <ul className="grid gap-1.5">
          {links.map((link) => {
            const ping = options.find((option) => option.value === link.pingId);
            const label = ping?.name ?? "Ping";
            return (
              <li
                key={link.pingId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium" title={label}>
                  {label}
                </span>
                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant={link.warn ? "default" : "outline"}
                    disabled={disabled}
                    aria-pressed={link.warn}
                    onClick={() =>
                      upsertLink(link.pingId, !link.warn, link.over)
                    }
                  >
                    Warn
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={link.over ? "default" : "outline"}
                    disabled={disabled}
                    aria-pressed={link.over}
                    onClick={() =>
                      upsertLink(link.pingId, link.warn, !link.over)
                    }
                  >
                    Over
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {PING_TYPES.map((type) => (
          <Button
            key={type}
            type="button"
            size="xs"
            variant={pingTypes.includes(type) ? "default" : "outline"}
            disabled={disabled}
            aria-pressed={pingTypes.includes(type)}
            onClick={() => setPingTypes(togglePingType(pingTypes, type))}
          >
            {pingTypeLabel(type)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => void createLinkedPing(true, false)}
        >
          Create {budgetName.trim() || "Name"} + Warn
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => void createLinkedPing(false, true)}
        >
          Create {budgetName.trim() || "Name"} + Over
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => void createLinkedPing(true, true)}
        >
          Create {budgetName.trim() || "Name"} + Warn + Over
        </Button>
      </div>
      {links.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Linked triggers use {budgetWarnTrigger(budgetName || "Name")},{" "}
          {budgetOverTrigger(budgetName || "Name")}, or{" "}
          {budgetWarnOverTrigger(budgetName || "Name")}.
        </p>
      ) : null}
    </div>
  );
}
