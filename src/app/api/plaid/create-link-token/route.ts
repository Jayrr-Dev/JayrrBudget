import { NextResponse } from "next/server";
import { createLinkToken } from "@/domains/banking/application/createLinkToken";

export async function POST() {
  const result = await createLinkToken();

  if (!result.ok) {
    return NextResponse.json(
      { code: result.code, error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    link_token: result.link_token,
    days_requested: result.days_requested,
  });
}
