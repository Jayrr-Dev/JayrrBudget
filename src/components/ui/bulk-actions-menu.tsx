"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RowActionsMenuItem } from "@/components/ui/row-actions-menu";
import { Icon } from "@iconify/react";

/**
 * Header clicker for the actions column: bulk version of row dropdowns.
 * Operates on currently visible (filtered/paged) rows.
 */
export function BulkActionsMenu({
  label = "visible rows",
  actions,
  disabled = false,
}: {
  label?: string;
  actions: RowActionsMenuItem[];
  disabled?: boolean;
}) {
  const empty = actions.length === 0;
  return (
    <span className="flex items-center justify-center">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11"
          aria-label={`Actions for ${label}`}
          title={`Actions for ${label}`}
          disabled={disabled || empty}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Icon
            icon="mynaui:mouse-pointer-click-solid"
            className="size-4"
            aria-hidden
          />
          <span className="sr-only">Actions for {label}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-44">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              className="cursor-pointer max-md:min-h-11"
              disabled={action.disabled}
              variant={action.variant}
              onClick={() => {
                window.setTimeout(() => action.onSelect(), 0);
              }}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
