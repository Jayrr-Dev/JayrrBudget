"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@iconify/react";

export type RowActionsMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
};

const TRIGGER_SIZE_CLASS = {
  xs: "size-4",
  sm: "size-7 max-md:size-11",
  md: "size-8 max-md:size-11",
} as const;

const TRIGGER_ICON_CLASS = {
  xs: "size-3.5",
  sm: "size-5 max-md:size-6",
  md: "size-5 max-md:size-6",
} as const;

export function RowActionsMenu({
  label,
  actions,
  size = "md",
}: {
  label: string;
  actions: RowActionsMenuItem[];
  size?: keyof typeof TRIGGER_SIZE_CLASS;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={`inline-flex ${TRIGGER_SIZE_CLASS[size]} cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]`}
        aria-label={`Actions for ${label}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Icon icon="basil:menu-outline" className={TRIGGER_ICON_CLASS[size]} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-36">
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
  );
}
