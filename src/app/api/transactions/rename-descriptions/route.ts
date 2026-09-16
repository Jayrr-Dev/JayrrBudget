import { renameTransactionDescriptions } from "@/domains/transactions/application/renameTransactionDescriptions";
import { errorMessage } from "@/shared/lib/error-message";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      from?: string;
      to?: string;
    };
    const result = await renameTransactionDescriptions({
      from: body.from ?? "",
      to: body.to ?? "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Failed to rename descriptions") },
      { status: 400 },
    );
  }
}
