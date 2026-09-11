import { NextResponse } from "next/server";
import { addTransactionTag } from "@/domains/transactions/application/addTransactionTag";
import { errorMessage } from "@/shared/lib/error-message";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      transactionId?: string;
      tag?: string;
    };
    const result = await addTransactionTag({
      transactionId: body.transactionId ?? "",
      tag: body.tag ?? "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Failed to add tag") },
      { status: 400 },
    );
  }
}
