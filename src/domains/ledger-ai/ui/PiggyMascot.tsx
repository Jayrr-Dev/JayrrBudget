"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";
import { piggyEmoteForMood, type PiggyMood } from "../domain/piggyMood";

export { piggyMoodFromChat, piggyMoodFromMessage, type PiggyMood } from "../domain/piggyMood";

export function PiggyMascot({
  mood = "still",
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
        "inline-flex shrink-0 items-center justify-center",
        className,
      )}
      aria-hidden
      data-piggy-emote={piggyEmoteForMood[mood]}
    >
      <Image
        src={`/piggy/${piggyEmoteForMood[mood]}.svg`}
        alt=""
        width={400}
        height={400}
        unoptimized
        loading="eager"
        draggable={false}
        className={cn("size-8 object-contain", iconClassName)}
      />
    </span>
  );
}
