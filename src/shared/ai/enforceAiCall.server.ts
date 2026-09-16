import "server-only";

import type { AiBilledTo } from "@/shared/ai/aiUsageSink";
import { api } from "@convex/_generated/api";
import type { ConvexHttpClient } from "convex/browser";

export type AiCallDenied = {
  ok: false;
  status: number;
  code: "rate_limited" | "cap_exceeded";
  error: string;
};

export async function checkAiCall(
  client: ConvexHttpClient,
  input: { billedTo: AiBilledTo; usesPlatformOcr?: boolean },
): Promise<{ ok: true } | AiCallDenied> {
  const result = await client.mutation(api.service.assertAiCall, {
    billedTo: input.billedTo,
    usesPlatformOcr: input.usesPlatformOcr ?? false,
  });
  if (result.ok) return { ok: true };
  return {
    ok: false,
    status: result.code === "rate_limited" ? 429 : 402,
    code: result.code,
    error: result.error,
  };
}

export function aiCallDeniedResponse(gate: AiCallDenied) {
  return Response.json(
    { error: gate.error, code: gate.code },
    { status: gate.status },
  );
}
