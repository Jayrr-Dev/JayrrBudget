"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { useMemo, useState, type SyntheticEvent } from "react";

type NamedRow = { name: string };

type ClassCatalog = {
  sections: NamedRow[];
  categories: NamedRow[];
  subcategories: NamedRow[];
};

const CLASS_TABS = ["section", "category", "subcategory"] as const;
type ClassTab = (typeof CLASS_TABS)[number];

const TAB_LABEL: Record<ClassTab, string> = {
  section: "Section",
  category: "Category",
  subcategory: "Subcategory",
};

const NONE_ITEM = "__none__";

const COMMIT_BLOCK_REASONS = new Set([
  "input-change",
  "list-navigation",
  "focus-out",
  "escape-key",
  "outside-press",
  "close-press",
  "cancel-open",
]);

function uniqueSortedNames(rows: NamedRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function tabForValue(
  catalog: ClassCatalog | undefined,
  value: string,
): ClassTab {
  if (!catalog || !value) return "section";
  const lower = value.toLowerCase();
  if (catalog.sections.some((row) => row.name.toLowerCase() === lower)) {
    return "section";
  }
  if (catalog.categories.some((row) => row.name.toLowerCase() === lower)) {
    return "category";
  }
  if (catalog.subcategories.some((row) => row.name.toLowerCase() === lower)) {
    return "subcategory";
  }
  return "section";
}

function namesForTab(
  catalog: ClassCatalog | undefined,
  tab: ClassTab,
): string[] {
  if (!catalog) return [];
  if (tab === "section") return uniqueSortedNames(catalog.sections);
  if (tab === "category") return uniqueSortedNames(catalog.categories);
  return uniqueSortedNames(catalog.subcategories);
}

function stopPopupClose(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

type ClassLookupComboboxProps = {
  id?: string;
  catalog: ClassCatalog | undefined;
  value: string;
  disabled?: boolean;
  /** Form: bordered trigger. Cell: transparent inline trigger for tables. */
  variant?: "form" | "cell";
  "aria-label"?: string;
  onChange: (next: string) => void;
};

export function ClassLookupCombobox({
  id,
  catalog,
  value,
  disabled,
  variant = "form",
  "aria-label": ariaLabel,
  onChange,
}: ClassLookupComboboxProps) {
  const [tab, setTab] = useState<ClassTab>(() => tabForValue(catalog, value));

  const tabNames = useMemo(() => namesForTab(catalog, tab), [catalog, tab]);
  const items = useMemo(() => [NONE_ITEM, ...tabNames], [tabNames]);
  const isCell = variant === "cell";
  const emptyLabel = isCell ? "—" : "None";

  return (
    <Combobox
      items={items}
      value={value || null}
      disabled={disabled || catalog === undefined}
      onValueChange={(next, details) => {
        const reason = details?.reason;
        if (reason && COMMIT_BLOCK_REASONS.has(reason)) return;
        if (next === NONE_ITEM || next == null) {
          onChange("");
          return;
        }
        if (typeof next !== "string") return;
        onChange(next);
      }}
    >
      <InputGroup
        className={cn(
          "w-full",
          isCell &&
            "h-auto border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        )}
      >
        <ComboboxTrigger
          id={id}
          aria-label={ariaLabel}
          disabled={disabled || catalog === undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm",
            isCell
              ? "h-auto gap-1 rounded-sm px-0 py-0 font-normal shadow-none ring-0 hover:bg-transparent focus-visible:ring-1 focus-visible:ring-ring/40 [&_svg]:size-3.5 [&_svg]:opacity-40"
              : "h-9 gap-2 px-3",
          )}
        >
          <span
            className={cn(
              "min-w-0 truncate",
              !value && "text-muted-foreground",
            )}
          >
            {value || emptyLabel}
          </span>
        </ComboboxTrigger>
        {value && !isCell ? (
          <InputGroupAddon align="inline-end">
            <ComboboxClear disabled={disabled || catalog === undefined} />
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <ComboboxContent
        className={cn(isCell ? "w-72" : "w-(--anchor-width) min-w-72")}
      >
        <ButtonGroup className="w-full px-1 pt-1">
          {CLASS_TABS.map((item) => (
            <Button
              key={item}
              type="button"
              size="xs"
              variant={tab === item ? "default" : "outline"}
              className="min-w-0 flex-1"
              aria-pressed={tab === item}
              onPointerDown={stopPopupClose}
              onMouseDown={stopPopupClose}
              onClick={(event) => {
                stopPopupClose(event);
                setTab(item);
              }}
            >
              {TAB_LABEL[item]}
            </Button>
          ))}
        </ButtonGroup>
        <ComboboxInput
          placeholder="Search"
          className="w-full"
          showTrigger={false}
        />
        <ComboboxEmpty>No match</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item === NONE_ITEM ? emptyLabel : item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
