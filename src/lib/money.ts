export function formatMoney(
  amount: number | null | undefined,
  currency = "USD",
) {
  if (amount == null || Number.isNaN(amount)) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/** Plaid amounts: positive = money out, negative = money in. */
export function formatPlaidSpend(amount: number, currency = "USD") {
  const signed = amount > 0 ? -amount : Math.abs(amount);
  return formatMoney(signed, currency);
}
