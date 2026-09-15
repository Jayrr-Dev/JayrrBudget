import { importBankStatement } from "@/domains/statements/application/importBankStatement";
import type { StatementImportProgress } from "@/domains/statements/domain/importProgress";
import type { ImportBankStatementSuccess } from "@/domains/statements/domain/importResult";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";
import { errorMessage } from "@/shared/lib/error-message";

export const runtime = "nodejs";
export const maxDuration = 300;

type StreamEvent =
  | { type: "progress"; progress: StatementImportProgress }
  | { type: "result"; result: ImportBankStatementSuccess }
  | { type: "error"; error: string; code?: string; status: number };

function encodeEvent(event: StreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export async function POST(request: Request) {
  let client;
  try {
    client = await getAuthenticatedConvexClient();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Could not read upload. Try the PDF again." },
      { status: 400 },
    );
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json(
      { error: "Expected a PDF file field named file." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = file.name || "statement.pdf";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      };

      try {
        const result = await importBankStatement({
          filename,
          bytes,
          client,
          onProgress: (progress) => {
            send({ type: "progress", progress });
          },
        });

        if (!result.ok) {
          send({
            type: "error",
            error: result.error,
            code: result.code,
            status: result.status,
          });
          controller.close();
          return;
        }

        send({ type: "result", result });
        controller.close();
      } catch (error) {
        send({
          type: "error",
          error: errorMessage(error, "Statement import failed"),
          status: 500,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
