"use client";

import { PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";

export type PiggyMood = "still" | "idle" | "listen" | "think" | "talk";

export function piggyMoodFromChat({
  status,
  listening,
}: {
  status: string;
  listening: boolean;
}): PiggyMood {
  if (status === "streaming") return "talk";
  if (status === "submitted") return "think";
  if (listening) return "listen";
  return "idle";
}

export function PiggyMascot({
  mood = "idle",
  className,
  iconClassName,
}: {
  mood?: PiggyMood;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex origin-bottom text-accent",
        mood === "idle" && "motion-safe:animate-piggy-idle",
        mood === "listen" && "motion-safe:animate-piggy-listen",
        mood === "think" && "motion-safe:animate-piggy-think",
        mood === "talk" && "motion-safe:animate-piggy-talk",
        className,
      )}
      aria-hidden
    >
      <PiggyBank className={cn("size-4", iconClassName)} strokeWidth={2.25} />
    </span>
  );
}
