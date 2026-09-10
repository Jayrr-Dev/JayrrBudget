import { NextResponse } from "next/server";
import { exchangePublicToken } from "@/domains/banking/application/exchangePublicToken";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    public_token?: string;
    institution?: { institution_id?: string; name?: string };
  };

  const result = await exchangePublicToken({
    public_token: body.public_token ?? "",
    institution: body.institution,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    item_id: result.item_id,
    accounts: result.accounts,
  });
}
