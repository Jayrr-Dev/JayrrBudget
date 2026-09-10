import { parseJson } from "@/shared/lib/parse-json";
import type { ImportBankStatementSuccess } from "@/domains/statements/domain/importResult";

export async function uploadBankStatement(file: File) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/statements/upload", {
    method: "POST",
    body: form,
  });

  return parseJson<ImportBankStatementSuccess>(response);
}
