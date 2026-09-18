import { PiggyIcon, type PiggyIconName } from "@/components/ui/piggy-icon";
import type { AccountCategory } from "@/domains/dashboard/domain/accountCategory";

const CATEGORY_ICON: Record<AccountCategory, PiggyIconName> = {
  chequing: "account-chequing",
  savings: "account-savings",
  credit_card: "account-credit",
  other: "accounts",
  lending: "loan-other",
};

const CATEGORY_TITLE: Record<AccountCategory, string> = {
  chequing: "Chequing",
  savings: "Savings",
  credit_card: "Credit card",
  other: "Account",
  lending: "Loan",
};

/** Decorative piggy-style artwork for a deposit or credit account category. */
export function AccountCategoryIcon({
  category,
  className,
}: {
  category: AccountCategory;
  className?: string;
}) {
  return (
    <span title={CATEGORY_TITLE[category]} className="inline-flex shrink-0">
      <PiggyIcon name={CATEGORY_ICON[category]} className={className} />
    </span>
  );
}
