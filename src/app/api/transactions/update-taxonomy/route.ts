import {
  TAXONOMY_FIELDS,
  updateTransactionTaxonomy,
  type TaxonomyField,
} from "@/domains/transactions/application/updateTransactionTaxonomy";
import { errorMessage } from "@/shared/lib/error-message";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      transactionId?: string;
      field?: string;
      value?: string | null;
    };
    const field = body.field ?? "";
    if (!(TAXONOMY_FIELDS as readonly string[]).includes(field)) {
      return NextResponse.json(
        { error: "field must be section, spread, category, or subcategory" },
        { status: 400 },
      );
    }
    const result = await updateTransactionTaxonomy({
      transactionId: body.transactionId ?? "",
      field: field as TaxonomyField,
      value: body.value ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Failed to update taxonomy") },
      { status: 400 },
    );
  }
}
