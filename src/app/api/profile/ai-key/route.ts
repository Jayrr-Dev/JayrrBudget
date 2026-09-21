import {
  encryptByokKey,
  isByokWrapConfigured,
  isJevKeyShape,
  isOpenRouterKeyShape,
  openRouterKeyLast4,
  type ByokProvider,
} from "@/shared/ai/byokWrap.server";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";

export const runtime = "nodejs";

function readProvider(value: string | undefined): ByokProvider | null {
  if (value === undefined || value === "openrouter") return "openrouter";
  if (value === "jev") return "jev";
  return null;
}

export async function POST(request: Request) {
  try {
    if (!isByokWrapConfigured()) {
      return Response.json(
        {
          error:
            "Missing AI_BYOK_WRAP_KEY. Add a 32-byte key to .env.local (openssl rand -base64 32).",
          code: "BYOK_WRAP_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      apiKey?: string;
      provider?: string;
    };
    const provider = readProvider(body.provider);
    if (!provider) {
      return Response.json(
        { error: "Choose OpenRouter or Jev." },
        { status: 400 },
      );
    }
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (provider === "openrouter" && !isOpenRouterKeyShape(apiKey)) {
      return Response.json(
        {
          error:
            "That does not look like an OpenRouter key. It should start with sk-or-.",
        },
        { status: 400 },
      );
    }
    if (provider === "jev" && !isJevKeyShape(apiKey)) {
      return Response.json(
        {
          error:
            "That does not look like a Jev key. Paste the key from the TypeSafe console.",
        },
        { status: 400 },
      );
    }

    const client = await getAuthenticatedConvexClient();
    const me = await client.query(api.users.me, {});
    if (!me) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const packed = encryptByokKey(provider, apiKey, me.userId);
    const status = await client.mutation(api.aiByok.putEncrypted, {
      provider,
      ciphertext: packed.ciphertext,
      iv: packed.iv,
      last4: openRouterKeyLast4(apiKey),
    });
    return Response.json(status);
  } catch (error) {
    return Response.json(
      { error: errorMessage(error, "Could not save the AI key.") },
      { status: error instanceof AuthRequiredError ? 401 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const provider = readProvider(
      new URL(request.url).searchParams.get("provider") ?? undefined,
    );
    if (!provider) {
      return Response.json(
        { error: "Choose OpenRouter or Jev." },
        { status: 400 },
      );
    }
    const client = await getAuthenticatedConvexClient();
    const status = await client.mutation(api.aiByok.remove, {
      provider,
    });
    return Response.json(status);
  } catch (error) {
    return Response.json(
      { error: errorMessage(error, "Could not remove the AI key.") },
      { status: error instanceof AuthRequiredError ? 401 : 500 },
    );
  }
}
