"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";

/** Page or section title with the helper copy in an info popover. */
export function TitleInfo({
  title,
  heading = "h1",
  lead,
  bullets,
}: {
  title: string;
  heading?: "h1" | "h2";
  lead: string;
  bullets?: readonly string[];
}) {
  const Heading = heading;
  const headingClass = heading === "h1" ? "type-page" : "type-section";

  const showBullets = (bullets?.length ?? 0) > 0;

  return (
    <Heading className={`${headingClass} flex items-center gap-2`}>
      {title}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
            aria-label={`About ${title}`}
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
            <PopoverTitle>{title}</PopoverTitle>
            <PopoverDescription>{lead}</PopoverDescription>
            {showBullets ? (
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                {bullets?.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    </Heading>
  );
}
