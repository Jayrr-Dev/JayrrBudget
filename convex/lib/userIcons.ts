import { v } from "convex/values";

/** Avatar icons under `public/user/<id>.svg`. */
export const USER_ICON_IDS = ["jay", "otter", "cat", "bulldog"] as const;
export type UserIconId = (typeof USER_ICON_IDS)[number];

export const DEFAULT_USER_ICON: UserIconId = "jay";

export const USER_ICON_LABELS: Record<UserIconId, string> = {
  jay: "Jay",
  otter: "Otter",
  cat: "Kat",
  bulldog: "Bull",
};

export const userIconValidator = v.union(
  v.literal("jay"),
  v.literal("otter"),
  v.literal("cat"),
  v.literal("bulldog"),
);

export function resolveUserIcon(value: unknown): UserIconId {
  return typeof value === "string" &&
    (USER_ICON_IDS as readonly string[]).includes(value)
    ? (value as UserIconId)
    : DEFAULT_USER_ICON;
}
