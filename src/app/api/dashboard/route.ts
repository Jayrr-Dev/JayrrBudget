import { NextResponse } from "next/server";
import { getDashboard } from "@/domains/dashboard/application/getDashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getDashboard();

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
