import type { AppModuleRecord } from "@/domains/modules/domain/types";
import {
  cachedConvexRead,
  invalidateConvexUserCache,
} from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

export async function ensureAppModules() {
  const client = await getAuthenticatedConvexClient();
  await client.mutation(api.modules.ensure, {});
}

export async function listAppModules(options?: {
  enabledOnly?: boolean;
}): Promise<AppModuleRecord[]> {
  const enabledOnly = options?.enabledOnly ?? false;
  return cachedConvexRead({
    name: "modules.list",
    args: { enabledOnly },
    load: async () => {
      const client = await getAuthenticatedConvexClient();
      return client.query(api.modules.list, { enabledOnly });
    },
  });
}

export async function setModuleEnabled(slug: string, enabled: boolean) {
  const client = await getAuthenticatedConvexClient();
  const result = await client.mutation(api.modules.setEnabled, {
    slug,
    enabled,
  });
  await invalidateConvexUserCache();
  return result;
}

export { AuthRequiredError };
