"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PiggyPingsManager } from "@/domains/piggy-pings/ui/PiggyPingsManager";
import { Info } from "lucide-react";

function PiggyPingsTitleInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
          aria-label="About Piggy Pings"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Piggy Pings</PopoverTitle>
          <PopoverDescription>
            Reminders for you, or ones Piggy creates in chat.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Toast, email, popup, or banner</li>
            <li>Cycle from the start date: weekly, weekdays, a date, monthly, EOM, or SOM</li>
            <li>Blank start or end means that side never closes</li>
            <li>Trigger stays empty until the send engine lands</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export default function PiggyPingsPage() {
  return (
    <div className="space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <h1 className="type-page flex items-center gap-2">
          Piggy Pings
          <PiggyPingsTitleInfo />
        </h1>
        <p className="sr-only">
          Reminders for you, or ones Piggy creates in chat. Toast, email,
          popup, or banner. Blank start or end means that side never closes.
        </p>
      </header>
      <PiggyPingsManager />
    </div>
  );
}
