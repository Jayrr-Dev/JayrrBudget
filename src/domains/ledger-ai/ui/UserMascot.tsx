"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";

export const USER_ICON_IDS = ["jay", "otter"] as const;
export type UserIconId = (typeof USER_ICON_IDS)[number];

const DEFAULT_USER_ICON: UserIconId = "jay";

export function UserMascot({
  icon = DEFAULT_USER_ICON,
  className,
  iconClassName,
}: {
  icon?: UserIconId;
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
    >
      <Image
        src={`/user/${icon}.svg`}
        alt=""
        width={128}
        height={128}
        unoptimized
        loading="eager"
        draggable={false}
        className={cn("size-8 object-contain", iconClassName)}
      />
    </span>
  );
}
