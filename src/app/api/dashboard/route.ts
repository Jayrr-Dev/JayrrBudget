import { NextRequest, NextResponse } from "next/server";
import { getDashboard } from "@/domains/dashboard/application/getDashboard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const transactionLimit =
    rawLimit == null
      ? 250
      : rawLimit === "all" || rawLimit === "0"
        ? null
        : Number(rawLimit);

  const result = await getDashboard({
    transactionLimit:
      typeof transactionLimit === "number" && !Number.isFinite(transactionLimit)
        ? 250
        : transactionLimit,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
