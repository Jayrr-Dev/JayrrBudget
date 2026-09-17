import { buildBudgetContextFromDashboard } from "@/domains/canvas/domain/budgetContext";
import { getDashboard } from "@/domains/dashboard/application/getDashboard";
import { api } from "@/shared/convex/httpClient";
import { getAuthenticatedConvexClient } from "@/shared/convex/httpClient.server";

const NOTE_PREVIEW_CHARS = 1_500;

function clip(text: string, max = NOTE_PREVIEW_CHARS) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/**
 * Compact ledger + workspace snapshot for Ledger AI (plaintext path).
 * Taxonomy is rendered separately as a tree in the system prompt.
 */
export async function getLedgerAiContext() {
  const [dashboard, client] = await Promise.all([
    getDashboard({ transactionLimit: 250 }),
    getAuthenticatedConvexClient(),
  ]);
  const [storeSheet, notes] = await Promise.all([
    client.query(api.scratchNotes.get, {}),
    client.query(api.userNotes.list, {}),
  ]);
  const budget = dashboard.ok
    ? buildBudgetContextFromDashboard(dashboard.data)
    : { error: dashboard.error };

  return {
    budget,
    storeSheet: {
      activeTab:
        storeSheet.tabs.find((tab) => tab.id === storeSheet.activeId)?.name ??
        null,
      receiveTab:
        storeSheet.tabs.find((tab) => tab.id === storeSheet.receiveId)?.name ??
        null,
      tabs: storeSheet.tabs.map((tab) => ({
        name: tab.name,
        rowCount: tab.rows.length,
        rows: tab.rows.slice(0, 40).map((row) => ({
          name: row.name,
          spend: row.spend,
          count: row.count,
          currency: row.currency,
          parent: row.parent ?? null,
        })),
      })),
    },
    notes: notes.map((note) => ({
      tabName: note.tabName,
      content: clip(note.content),
    })),
  };
}
