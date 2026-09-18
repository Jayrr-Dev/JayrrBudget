"use client";

import OverviewPage from "@/app/(saas)/page";
import { AppShell } from "@/components/layout/AppShell";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";

export function OfflineFallbackView() {
  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="type-kicker text-[20px] flex items-center gap-2">
          Offline
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
                aria-label="About offline last view"
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
                <PopoverTitle>Offline last view</PopoverTitle>
                <PopoverDescription>
                  This page opens when a navigation cannot reach the network.
                </PopoverDescription>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                  <li>
                    Dashboard and sidebar come from the last successful load
                  </li>
                  <li>Uploads and edits wait until you reconnect</li>
                </ul>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </h1>
        <p className="sr-only">
          Showing the dashboard last loaded while you were online. Uploads and
          edits wait until you reconnect.
        </p>
        <OverviewPage />
      </div>
    </AppShell>
  );
}
