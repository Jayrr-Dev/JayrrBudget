/** Nickname shown in the UI. Falls back to the stored account name. */
export function displayAccountName(account: {
  name: string;
  label?: string | null;
}) {
  const label = account.label?.trim();
  return label ? label : account.name;
}

export function normalizeAccountLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
