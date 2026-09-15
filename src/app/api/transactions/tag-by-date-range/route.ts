import { NextResponse } from "next/server";
import { tagByDateRange } from "@/domains/transactions/application/tagByDateRange";
import { errorMessage } from "@/shared/lib/error-message";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tag?: string;
      startDate?: string;
      endDate?: string;
      excludeTransactionIds?: string[];
    };
    const result = await tagByDateRange({
      tag: body.tag ?? "",
      startDate: body.startDate ?? "",
      endDate: body.endDate ?? "",
      excludeTransactionIds: body.excludeTransactionIds,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Failed to tag by date range") },
      { status: 400 },
    );
  }
}
