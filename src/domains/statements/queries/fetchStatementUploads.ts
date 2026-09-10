import { parseJson } from "@/shared/lib/parse-json";
import type {
  StatementUploadDetail,
  StatementUploadLog,
} from "@/domains/statements/domain/types";

export async function fetchStatementUploads() {
  const response = await fetch("/api/statements", { cache: "no-store" });
  return parseJson<{ ok: true; uploads: StatementUploadLog[] }>(response);
}

export async function fetchStatementUpload(id: number) {
  const response = await fetch(`/api/statements/${id}`, { cache: "no-store" });
  return parseJson<{ ok: true; upload: StatementUploadDetail }>(response);
}
