/** Channel already stores online / in_store. Do not also keep those as tags. */
const CHANNEL_MIRROR_TAG_NAMES = new Set(["online", "in store", "in_store"]);

export function isChannelMirrorTag(name: string | null | undefined) {
  if (!name) return false;
  return CHANNEL_MIRROR_TAG_NAMES.has(name.trim().toLowerCase());
}

export function withoutChannelMirrorTags<T extends string>(tags: T[]): T[] {
  return tags.filter((tag) => !isChannelMirrorTag(tag));
}

export function channelFromMirrorTags(
  tags: Array<string | null | undefined>,
): "online" | "in_store" | undefined {
  const names = tags.filter(Boolean).map((tag) => String(tag).toLowerCase());
  if (names.some((name) => name === "online")) return "online";
  if (names.some((name) => name === "in store" || name === "in_store")) {
    return "in_store";
  }
  return undefined;
}
