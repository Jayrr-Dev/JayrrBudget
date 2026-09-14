import type { AppModuleRecord } from "@/domains/modules/domain/types";
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
  const client = await getAuthenticatedConvexClient();
  return client.query(api.modules.list, {
    enabledOnly: options?.enabledOnly ?? false,
  });
}

export async function setModuleEnabled(slug: string, enabled: boolean) {
  const client = await getAuthenticatedConvexClient();
  return client.mutation(api.modules.setEnabled, { slug, enabled });
}

export { AuthRequiredError };
