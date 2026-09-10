import { NextResponse } from "next/server";
import { syncTransactions } from "@/domains/transactions/application/syncTransactions";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    resetCursor?: boolean;
    waitForHistory?: boolean;
  };

  const result = await syncTransactions({
    resetCursor: body.resetCursor,
    waitForHistory: body.waitForHistory,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
