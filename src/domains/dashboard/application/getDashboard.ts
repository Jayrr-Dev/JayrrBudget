import type { DashboardData } from "@/domains/dashboard/domain/types";
import { cachedConvexRead } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

export type GetDashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; status: number; error: string };

const DEFAULT_TRANSACTION_LIMIT = 250;

export async function getDashboard(options?: {
  transactionLimit?: number | null;
}): Promise<GetDashboardResult> {
  const transactionLimit =
    options?.transactionLimit === undefined
      ? DEFAULT_TRANSACTION_LIMIT
      : options.transactionLimit;
  try {
    return await cachedConvexRead({
      name: "dashboard.get",
      args: { transactionLimit },
      load: async () => {
        const client = await getAuthenticatedConvexClient();
        return (await client.query(api.dashboard.get, {
          transactionLimit,
        })) as GetDashboardResult;
      },
    });
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
