"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useHoverPointer, useIsMobile } from "@/hooks/use-mobile";
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
  const headingClass =
    heading === "h1" ? "type-kicker text-[20px]" : "type-section";
  const hover = useHoverPointer();
  const isMobile = useIsMobile();
  const showBullets = (bullets?.length ?? 0) > 0;
  const trigger = (
    <button
      type="button"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary sm:size-6"
      aria-label={`About ${title}`}
    >
      <Info className="size-3.5" />
    </button>
  );
  const bulletsList = showBullets ? (
    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
      {bullets?.map((bullet) => (
        <li key={bullet}>{bullet}</li>
      ))}
    </ul>
  ) : null;

  return (
    <Heading className={`${headingClass} flex items-center gap-2`}>
      {title}
      {isMobile ? (
        <Dialog>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{lead}</DialogDescription>
              {bulletsList}
            </DialogHeader>
          </DialogContent>
        </Dialog>
      ) : (
        <Popover modal={!hover}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-3.5"
          >
            <PopoverHeader className="gap-1.5">
              <PopoverTitle>{title}</PopoverTitle>
              <PopoverDescription>{lead}</PopoverDescription>
              {bulletsList}
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      )}
    </Heading>
  );
}
