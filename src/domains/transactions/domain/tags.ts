/** Split CSV-style tags column into unique display names. */
export function splitTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,|;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Join tags for storage; case-insensitive dedupe, first spelling wins. */
export function joinTags(tags: string[]): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.length ? out.join(", ") : null;
}

export function hasTag(tags: string[], name: string) {
  return tags.some((t) => t.toLowerCase() === name.toLowerCase());
}
