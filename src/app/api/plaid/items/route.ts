import { NextResponse } from "next/server";
import { removeItems } from "@/domains/banking/application/removeItems";

export async function DELETE() {
  const result = await removeItems();

  if (!result.ok) {
    return NextResponse.json(
      { code: result.code, error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    removed_items: result.removed_items,
    message: result.message,
  });
}
