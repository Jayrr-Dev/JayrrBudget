import type { DashboardData } from "@/domains/dashboard/domain/types";
import { api } from "@/shared/convex/httpClient";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

export type GetDashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; status: number; error: string };

export async function getDashboard(options?: {
  transactionLimit?: number | null;
}): Promise<GetDashboardResult> {
  try {
    const client = await getAuthenticatedConvexClient();
    const result = await client.query(api.dashboard.get, {
      transactionLimit: options?.transactionLimit ?? null,
    });
    return result as GetDashboardResult;
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return { ok: false, status: 401, error: error.message };
    }
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Convex dashboard unavailable",
    };
  }
}
