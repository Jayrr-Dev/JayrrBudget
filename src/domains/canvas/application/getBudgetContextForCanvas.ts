import { getDashboard } from "@/domains/dashboard/application/getDashboard";
import { buildBudgetContextFromDashboard } from "@/domains/canvas/domain/budgetContext";
import { api } from "@/shared/convex/httpClient";
import { getAuthenticatedConvexClient } from "@/shared/convex/httpClient.server";

/** Compact ledger snapshot for canvas AI system prompt (plaintext path). */
export async function getBudgetContextForCanvas() {
  const [result, client] = await Promise.all([
    getDashboard({ transactionLimit: 250 }),
    getAuthenticatedConvexClient(),
  ]);
  if (!result.ok) {
    return { error: result.error };
  }
  // Statement metadata lives only in Convex; the private-ledger client path skips it.
  const statements = await client.query(api.statements.listForAi, {}).catch(() => []);
  return { ...buildBudgetContextFromDashboard(result.data), statements };
}
