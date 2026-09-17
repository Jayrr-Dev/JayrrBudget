import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const loanFieldsValidator = v.object({
  name: v.union(v.string(), v.null()),
  loanType: v.union(
    v.literal("auto"),
    v.literal("mortgage"),
    v.literal("student"),
    v.literal("personal"),
    v.literal("heloc"),
    v.literal("other"),
  ),
  rateType: v.union(v.literal("fixed"), v.literal("variable")),
  vehicleLabel: v.union(v.string(), v.null()),
  principalStart: v.union(v.number(), v.null()),
  annualRatePct: v.union(v.number(), v.null()),
  paymentAmount: v.union(v.number(), v.null()),
  paymentFrequency: v.union(
    v.literal("weekly"),
    v.literal("biweekly"),
    v.literal("semimonthly"),
    v.literal("monthly"),
  ),
  paymentCount: v.union(v.number(), v.null()),
  firstPaymentDate: v.union(v.string(), v.null()),
  matchMerchantClean: v.union(v.string(), v.null()),
  institutionName: v.union(v.string(), v.null()),
});

const parseSuccessValidator = v.object({
  ok: v.literal(true),
  filename: v.string(),
  fileHash: v.string(),
  pageCount: v.number(),
  fields: loanFieldsValidator,
  ocrMarkdown: v.string(),
  uploadId: v.number(),
});

function fieldsFromRow(row: {
  name: string | null;
  loanType: string | null;
  rateType: string | null;
  vehicleLabel: string | null;
  principalStart: number | null;
  annualRatePct: number | null;
  paymentAmount: number | null;
  paymentFrequency: string | null;
  paymentCount: number | null;
  firstPaymentDate: string | null;
  matchMerchantClean: string | null;
  institutionName: string | null;
}) {
  const loanType =
    row.loanType === "auto" ||
    row.loanType === "mortgage" ||
    row.loanType === "student" ||
    row.loanType === "personal" ||
    row.loanType === "heloc" ||
    row.loanType === "other"
      ? row.loanType
      : "other";
  const rateType = row.rateType === "variable" ? "variable" : "fixed";
  const paymentFrequency =
    row.paymentFrequency === "weekly" ||
    row.paymentFrequency === "biweekly" ||
    row.paymentFrequency === "semimonthly" ||
    row.paymentFrequency === "monthly"
      ? row.paymentFrequency
      : "monthly";

  return {
    name: row.name,
    loanType,
    rateType,
    vehicleLabel: row.vehicleLabel,
    principalStart: row.principalStart,
    annualRatePct: row.annualRatePct,
    paymentAmount: row.paymentAmount,
    paymentFrequency,
    paymentCount: row.paymentCount,
    firstPaymentDate: row.firstPaymentDate,
    matchMerchantClean: row.matchMerchantClean,
    institutionName: row.institutionName,
  } as const;
}

export const findCompletedByFileHash = query({
  args: { fileHash: v.string() },
  returns: v.union(parseSuccessValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const prior = await ctx.db
      .query("loanDocumentUploads")
      .withIndex("by_userId_fileHash", (q) =>
        q.eq("userId", user._id).eq("fileHash", args.fileHash),
      )
      .collect();
    const completed = prior.find((row) => row.status === "completed");
    if (!completed || !completed.fileHash) return null;

    return {
      ok: true as const,
      filename: completed.filename,
      fileHash: completed.fileHash,
      pageCount: completed.pageCount ?? 0,
      fields: fieldsFromRow(completed),
      ocrMarkdown: completed.ocrMarkdown ?? "",
      uploadId: completed.uploadId,
    };
  },
});

export const getByAccountId = query({
  args: { accountId: v.string() },
  returns: v.union(
    v.object({
      uploadId: v.number(),
      filename: v.string(),
      fileHash: v.union(v.string(), v.null()),
      hasOcr: v.boolean(),
      ocrMarkdown: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("loanDocumentUploads")
      .withIndex("by_userId_accountId", (q) =>
        q.eq("userId", user._id).eq("accountId", args.accountId),
      )
      .collect();
    const row = rows
      .filter((item) => item.status === "completed")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!row) return null;
    return {
      uploadId: row.uploadId,
      filename: row.filename,
      fileHash: row.fileHash,
      hasOcr: Boolean(row.ocrMarkdown?.trim()),
      ocrMarkdown: row.ocrMarkdown ?? null,
      createdAt: row.createdAt,
    };
  },
});

export const saveParsed = mutation({
  args: {
    filename: v.string(),
    fileHash: v.string(),
    pageCount: v.number(),
    ocrMarkdown: v.string(),
    fields: loanFieldsValidator,
  },
  returns: v.object({ uploadId: v.number() }),
  handler: async () => {
    throw new Error(
      "saveParsed is retired. Register lending accounts in the private ledger (vault).",
    );
  },
});

export const linkToAccount = mutation({
  args: {
    fileHash: v.string(),
    accountId: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async () => {
    throw new Error(
      "linkToAccount is retired. Register lending accounts in the private ledger (vault).",
    );
  },
});
