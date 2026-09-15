import { getDashboard } from "@/domains/dashboard/application/getDashboard";
import { buildBudgetContextFromDashboard } from "@/domains/canvas/domain/budgetContext";

/** Compact ledger snapshot for canvas AI system prompt (plaintext path). */
export async function getBudgetContextForCanvas() {
  const result = await getDashboard({ transactionLimit: 250 });
  if (!result.ok) {
    return { error: result.error };
  }
  return buildBudgetContextFromDashboard(result.data);
}
