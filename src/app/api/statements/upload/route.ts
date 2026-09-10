import { NextResponse } from "next/server";
import { importBankStatement } from "@/domains/statements/application/importBankStatement";
import { errorMessage } from "@/shared/lib/error-message";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not read upload. Try the PDF again." },
      { status: 400 },
    );
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Expected a PDF file field named file." },
      { status: 400 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await importBankStatement({
      filename: file.name || "statement.pdf",
      bytes,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Statement import failed") },
      { status: 500 },
    );
  }
}
