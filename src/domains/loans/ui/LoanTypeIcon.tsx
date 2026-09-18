import { PiggyIcon, type PiggyIconName } from "@/components/ui/piggy-icon";
import { LOAN_TYPES, normalizeLoanType } from "@/domains/loans/domain/loanTypes";

/** Decorative piggy-style artwork for a loan kind; falls back to the generic money bag. */
export function LoanTypeIcon({
  loanType,
  className,
}: {
  loanType: string | null | undefined;
  className?: string;
}) {
  const kind = normalizeLoanType(loanType);
  const label = LOAN_TYPES.find((t) => t.value === kind)?.label ?? "Loan";
  const name: PiggyIconName = `loan-${kind}`;
  return (
    <span title={label} className="inline-flex shrink-0">
      <PiggyIcon name={name} className={className} />
    </span>
  );
}
