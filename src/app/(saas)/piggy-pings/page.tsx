"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CreatePingDialog,
  PiggyPingsManager,
} from "@/domains/piggy-pings/ui/PiggyPingsManager";
import { Info } from "lucide-react";
import { useState } from "react";

function PiggyPingsTitleInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-11 sm:size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
          aria-label="About Pings"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Pings</PopoverTitle>
          <PopoverDescription>
            Reminders for you, or ones Jev creates in chat.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>
              Toast, email, dialog, and banner. Toast is the default. One ping
              can use more than one
            </li>
            <li>
              Budget links from the Budgets page land here too, ready to edit
            </li>
            <li>
              Cycle from the start date: weekly, weekdays, a date, monthly, EOM,
              or SOM
            </li>
            <li>Blank start or end means that side never closes</li>
            <li>Trigger stays empty until the send engine lands</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export default function PiggyPingsPage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="type-kicker text-[20px] flex items-center gap-2">
            Pings
            <PiggyPingsTitleInfo />
          </h1>
          <p className="sr-only">
            Reminders for you, or ones Jev creates in chat. Toast, email, popup,
            and banner. Blank start or end means that side never closes.
          </p>
        </div>
        <CreatePingDialog open={createOpen} onOpenChange={setCreateOpen} />
      </header>
      <PiggyPingsManager onCreatePing={() => setCreateOpen(true)} />
    </div>
  );
}
