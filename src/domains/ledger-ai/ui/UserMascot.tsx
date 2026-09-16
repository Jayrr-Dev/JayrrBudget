"use client";

import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import { DEFAULT_USER_ICON, type UserIconId } from "@convex/lib/userIcons";
import { useConvexAuth, useQuery } from "convex/react";
import Image from "next/image";

export type { UserIconId } from "@convex/lib/userIcons";

/** User avatar. Falls back to the signed-in user's saved icon when `icon` is omitted. */
export function UserMascot({
  icon,
  className,
  iconClassName,
}: {
  icon?: UserIconId;
  className?: string;
  iconClassName?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(
    api.users.me,
    icon === undefined && isAuthenticated ? {} : "skip",
  );
  const resolved = icon ?? me?.avatarIcon ?? DEFAULT_USER_ICON;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-visible",
        className,
      )}
      aria-hidden
    >
      <Image
        src={`/user/${resolved}.svg`}
        alt=""
        width={128}
        height={128}
        unoptimized
        loading="eager"
        draggable={false}
        className={cn("size-8 overflow-visible object-contain", iconClassName)}
      />
    </span>
  );
}
