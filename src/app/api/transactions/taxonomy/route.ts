import { getTransactionTaxonomy } from "@/domains/transactions/application/getTransactionTaxonomy";
import { errorMessage } from "@/shared/lib/error-message";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await getTransactionTaxonomy();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Failed to load taxonomy") },
      { status: 500 },
    );
  }
}
