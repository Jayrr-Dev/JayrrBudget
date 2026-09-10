import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  accountHintFromFilename,
  parseCibcHistoryCsv,
  type AccountHint,
} from "@/domains/bank-history/domain/parseCibcCsv";
import { getDb } from "@/shared/db";
import { bankHistoryFiles, bankHistoryRows } from "@/shared/db/schema";

export type ImportBankHistoryResult = {
  filename: string;
  fileId: number;
  accountMask: string;
  accountType: string;
  inserted: number;
  skipped: boolean;
};

function fileHash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function importBankHistoryFile(params: {
  filename: string;
  bytes: Buffer;
  hint?: AccountHint | null;
}): Promise<ImportBankHistoryResult> {
  const hint = params.hint ?? accountHintFromFilename(params.filename);
  if (!hint) {
    throw new Error(`Cannot infer account from filename: ${params.filename}`);
  }

  const hash = fileHash(params.bytes);
  const db = getDb();

  const existing = await db
    .select()
    .from(bankHistoryFiles)
    .where(eq(bankHistoryFiles.fileHash, hash))
    .limit(1);

  if (existing[0]) {
    await db
      .delete(bankHistoryRows)
      .where(eq(bankHistoryRows.fileId, existing[0].id));
    await db
      .delete(bankHistoryFiles)
      .where(eq(bankHistoryFiles.id, existing[0].id));
  }

  const text = params.bytes.toString("utf8");
  const parsed = parseCibcHistoryCsv(text, hint);
  if (parsed.length === 0) {
    throw new Error(`No CIBC history rows in ${params.filename}`);
  }

  const [file] = await db
    .insert(bankHistoryFiles)
    .values({
      filename: params.filename,
      fileHash: hash,
      accountMask: hint.mask,
      accountType: hint.accountType,
      productName: hint.productName,
      rowCount: parsed.length,
      importedAt: new Date(),
    })
    .returning();

  const chunkSize = 200;
  for (let i = 0; i < parsed.length; i += chunkSize) {
    const chunk = parsed.slice(i, i + chunkSize);
    await db.insert(bankHistoryRows).values(
      chunk.map((row) => ({
        fileId: file.id,
        fingerprint: row.fingerprint,
        accountMask: row.accountMask,
        accountType: row.accountType,
        date: row.date,
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        direction: row.direction,
        amount: row.amount,
        cardNumber: row.cardNumber,
        sourceFilename: params.filename,
        matchStatus: "unmatched",
        createdAt: new Date(),
      })),
    );
  }

  return {
    filename: params.filename,
    fileId: file.id,
    accountMask: hint.mask,
    accountType: hint.accountType,
    inserted: parsed.length,
    skipped: false,
  };
}
