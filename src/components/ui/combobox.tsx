"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { cn } from "cn";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  XIcon,
} from "lucide-react";

type ComboboxLayout = "list" | "table";

const TABLE_GRID_COLS =
  "grid-cols-[7.5rem_minmax(16rem,1fr)_7rem] [&>*]:min-w-0 [&>*]:overflow-hidden";

const ComboboxLayoutContext = React.createContext<{
  layout: ComboboxLayout;
  columns: string[];
}>({ layout: "list", columns: [] });

const Combobox = ComboboxPrimitive.Root;

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <XIcon className="pointer-events-none" />
    </ComboboxPrimitive.Clear>
  );
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean;
  showClear?: boolean;
}) {
  return (
    <InputGroup className={cn("w-auto", className)}>
      <ComboboxPrimitive.Input
        render={<InputGroupInput disabled={disabled} />}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            asChild
            // ComboboxTrigger is a native <button>; Button defaults nativeButton=false for asChild.
            nativeButton
            data-slot="input-group-button"
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
            disabled={disabled}
          >
            <ComboboxTrigger />
          </InputGroupButton>
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  layout = "list",
  columns,
  sort,
  onSort,
  children,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  > & {
    layout?: ComboboxLayout;
    columns?: string[];
    sort?: { column: string; direction: "asc" | "desc" };
    onSort?: (column: string) => void;
  }) {
  const tableColumns = columns ?? [];
  const table = layout === "table" && tableColumns.length > 0;

  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="pointer-events-auto isolate z-100 outline-none data-closed:pointer-events-none"
      >
        <ComboboxLayoutContext.Provider
          value={{ layout: table ? "table" : "list", columns: tableColumns }}
        >
          <ComboboxPrimitive.Popup
            data-slot="combobox-content"
            data-chips={!!anchor}
            data-layout={table ? "table" : "list"}
            style={
              table
                ? {
                    width: "min(52rem, calc(100vw - 2rem))",
                    minWidth: "min(52rem, calc(100vw - 2rem))",
                    maxWidth: "min(52rem, calc(100vw - 2rem))",
                  }
                : undefined
            }
            className={cn(
              "group/combobox-content pointer-events-auto relative flex max-h-[min(24rem,var(--available-height,24rem))] origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:shadow-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              table
                ? "w-[min(52rem,calc(100vw-2rem))] max-w-[min(52rem,calc(100vw-2rem))]"
                : "w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] data-[chips=true]:min-w-(--anchor-width)",
              className,
            )}
            {...props}
          >
            {table ? (
              <div
                role="row"
                className={cn(
                  "grid shrink-0 items-center gap-4 border-b border-border px-2 py-1.5 pr-8 text-xs font-medium text-muted-foreground",
                  TABLE_GRID_COLS,
                )}
              >
                {tableColumns.map((column) => {
                  const amount = column.toLowerCase() === "amount";
                  const date = column.toLowerCase() === "date";
                  const active = sort?.column === column;
                  if (!onSort) {
                    return (
                      <span
                        key={column}
                        className={cn(
                          "min-w-0 truncate",
                          amount ? "text-right" : null,
                          date ? "font-mono tabular-nums" : null,
                        )}
                      >
                        {column}
                      </span>
                    );
                  }
                  return (
                    <button
                      key={column}
                      type="button"
                      className={cn(
                        "inline-flex min-w-0 items-center gap-1 truncate rounded-sm text-left hover:text-foreground",
                        amount ? "justify-end text-right" : null,
                        date ? "font-mono tabular-nums" : null,
                        active ? "text-foreground" : null,
                      )}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSort(column);
                      }}
                    >
                      <span className="truncate">{column}</span>
                      {active && sort?.direction === "asc" ? (
                        <ArrowUpIcon className="size-3 shrink-0" />
                      ) : active && sort?.direction === "desc" ? (
                        <ArrowDownIcon className="size-3 shrink-0" />
                      ) : (
                        <ArrowUpDownIcon className="size-3 shrink-0 opacity-40" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {children}
          </ComboboxPrimitive.Popup>
        </ComboboxLayoutContext.Provider>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  const { layout } = React.useContext(ComboboxLayoutContext);
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "min-h-0 flex-1 scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        layout === "table" ? "p-0" : null,
        className,
      )}
      onWheel={(event) => {
        event.stopPropagation();
      }}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  const { layout } = React.useContext(ComboboxLayoutContext);
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-primary-subtle data-highlighted:text-primary-subtle-foreground not-data-[variant=destructive]:data-highlighted:**:text-primary-subtle-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        layout === "table"
          ? cn(
              "grid items-start gap-4 rounded-none border-b border-border/70 py-2 pr-8 pl-2 last:border-b-0",
              TABLE_GRID_COLS,
            )
          : null,
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn(className)}
      {...props}
    />
  );
}

function ComboboxLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return (
    <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> &
  ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-control-border bg-surface-elevated bg-clip-padding px-2.5 py-1 text-sm transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 has-data-[slot=combobox-chip]:px-1 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean;
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          className="-ml-1 opacity-50 hover:opacity-100"
          data-slot="combobox-chip-remove"
        >
          <XIcon className="pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn("min-w-16 flex-1 outline-none", className)}
      {...props}
    />
  );
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
};
