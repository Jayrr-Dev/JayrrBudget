import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import type {
  RegisterLoanFromDocumentInput,
  RegisterLoanFromDocumentOutput,
} from "@/domains/ledger-ai/domain/registerLoanFromDocumentTool";
import {
  encryptLoanDocumentToVault,
  linkEncryptedLoanDocument,
} from "@/domains/loans/application/encryptLoanDocument";
import { uploadLoanDocument } from "@/domains/loans/queries/uploadLoanDocument";
import {
  loanTypeMeta,
  normalizeLoanType,
  normalizeRateType,
  officialLoanName,
} from "@/domains/loans/domain/loanTypes";
import { normalizePaymentFrequency } from "@/domains/loans/domain/paymentFrequency";
import {
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import {
  loadPrivateLedger,
  type VaultListClient,
} from "@/domains/vault/application/loadPrivateLedger";
import {
  saveEncryptedLoan,
  saveEncryptedRecords,
} from "@/domains/vault/application/saveEncryptedLedger";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import type { ConvexReactClient } from "convex/react";

const LOAN_REQUIRED = [
  "name",
  "principalStart",
  "annualRatePct",
  "paymentAmount",
  "paymentCount",
  "firstPaymentDate",
] as const;

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as Partial<T>;
}

export async function registerLoanFromChat(options: {
  file: File;
  overrides?: RegisterLoanFromDocumentInput["overrides"];
  cloudProcessing: boolean;
  convex: ConvexReactClient;
  userId: string | null;
  vaultId: string | null;
  keyId: string | null;
  ledger?: PrivateLedger;
}): Promise<RegisterLoanFromDocumentOutput> {
  if (!options.cloudProcessing) {
    return {
      ok: false,
      error:
        "Turn on Cloud Processing in Modules before registering a loan from a document.",
    };
  }

  try {
    const parsed = await uploadLoanDocument(options.file, {
      persistMode: "vault",
    });

    const terms = {
      ...parsed.fields,
      ...stripUndefined(options.overrides ?? {}),
    };
    const needs = LOAN_REQUIRED.filter((key) => {
      const value = terms[key];
      return value === null || value === undefined || value === "";
    });
    if (needs.length > 0) {
      return {
        ok: false,
        needs: [...needs],
        parsed: terms as Record<string, unknown>,
        error: `Missing loan terms: ${needs.join(", ")}. Ask the user, then retry with overrides.`,
      };
    }

    const opened = await hydrateVaultSession(
      options.convex as unknown as VaultClient,
    );
    const masterKey = getVaultMasterKey();
    const vaultId = options.vaultId ?? opened?.vaultId ?? null;
    const keyId = options.keyId ?? opened?.keyId ?? null;
    if (!options.userId || !vaultId || !keyId || !masterKey) {
      return {
        ok: false,
        error: "Unlock the vault, then ask Piggy to register the loan again.",
      };
    }

    const ledger =
      options.ledger ??
      (await loadPrivateLedger(options.convex as unknown as VaultListClient, {
        userId: options.userId,
        vaultId,
      }));

    await encryptLoanDocumentToVault({
      client: options.convex as unknown as MutationClient,
      userId: options.userId,
      vaultId,
      keyId,
      masterKey,
      filename: parsed.filename,
      fileHash: parsed.fileHash,
      pageCount: parsed.pageCount,
      fields: parsed.fields,
      ocrMarkdown: parsed.ocrMarkdown,
      ledger,
    });

    const name = String(terms.name).trim();
    const loanType = normalizeLoanType(terms.loanType);
    const rateType = normalizeRateType(terms.rateType);
    const typeMeta = loanTypeMeta(loanType);
    const paymentFrequency = normalizePaymentFrequency(
      String(terms.paymentFrequency ?? typeMeta.defaultFrequency),
    );
    const principalStart = Number(terms.principalStart);
    const annualRatePct = Number(terms.annualRatePct);
    const paymentAmount = Number(terms.paymentAmount);
    const paymentCount = Math.floor(Number(terms.paymentCount));
    const firstPaymentDate = String(terms.firstPaymentDate);
    const vehicleLabel =
      terms.vehicleLabel == null ? null : String(terms.vehicleLabel).trim() || null;
    const matchMerchantClean =
      terms.matchMerchantClean == null
        ? null
        : String(terms.matchMerchantClean).trim() || null;

    const write = {
      client: options.convex,
      userId: options.userId,
      vaultId,
      keyId,
    };
    const accountId = `loan-${crypto.randomUUID()}`;
    await saveEncryptedRecords(write, [
      {
        recordId: `account-${accountId}`,
        kind: "account_meta",
        value: {
          accountId,
          name,
          officialName: officialLoanName(name, loanType, vehicleLabel),
          mask: null,
          type: loanType === "mortgage" ? "mortgage" : "loan",
          subtype: typeMeta.subtype,
          currentBalance: principalStart,
          availableBalance: principalStart,
          isoCurrencyCode: "CAD",
        },
        expectedRevision: null,
      },
    ]);
    await saveEncryptedLoan(write, {
      accountId,
      principal: principalStart,
      annualRate: annualRatePct / 100,
      paymentAmount,
      firstPaymentDate,
      paymentCount,
      paymentFrequency,
      loanType,
      rateType,
      vehicleLabel,
      matchMerchantClean,
      matchAmount: paymentAmount,
      expectedRevision: null,
    });

    const nextLedger = await loadPrivateLedger(
      options.convex as unknown as VaultListClient,
      { userId: options.userId, vaultId },
    );
    await linkEncryptedLoanDocument({
      client: options.convex as unknown as MutationClient,
      userId: options.userId,
      vaultId,
      keyId,
      masterKey,
      fileHash: parsed.fileHash,
      accountId,
      ledger: nextLedger,
    });

    return {
      ok: true,
      accountId,
      name,
      loanType,
      principalStart,
      annualRatePct,
      paymentAmount,
      paymentCount,
      firstPaymentDate,
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not register the loan"),
    };
  }
}
