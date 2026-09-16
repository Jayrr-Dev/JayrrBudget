import { AccountsView } from "@/domains/dashboard/ui/AccountsView";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.account;
  const selectedAccountId = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
  return <AccountsView selectedAccountId={selectedAccountId} />;
}
