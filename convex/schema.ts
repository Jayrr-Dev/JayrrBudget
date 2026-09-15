import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Personal ledgers: every private row is scoped by `userId`.
 * Business keys stay as strings; Convex `_id` is not the ledger id.
 * Uniqueness is enforced in upserts via indexes (no SQL UNIQUE).
 *
 * `userId` is optional only so legacy rows can be claimed by backfill;
 * live writes always set it via requireUser().
 *
 * `users` is Convex Auth shape, with optional legacy Clerk fields so the
 * bootstrap row can be deleted during cutover.
 */
const userId = v.optional(v.id("users"));

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    /** RBAC: admin | normal | premium (defaults to normal when missing). */
    role: v.optional(
      v.union(
        v.literal("admin"),
        v.literal("normal"),
        v.literal("premium"),
      ),
    ),
    // Legacy Clerk / bootstrap fields (remove after cutover clear)
    tokenIdentifier: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("role", ["role"]),

  institutions: defineTable({
    userId,
    institutionId: v.string(),
    name: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_institutionId", ["userId", "institutionId"]),

  accounts: defineTable({
    userId,
    accountId: v.string(),
    institutionId: v.string(),
    name: v.string(),
    officialName: v.union(v.string(), v.null()),
    mask: v.union(v.string(), v.null()),
    type: v.union(v.string(), v.null()),
    subtype: v.union(v.string(), v.null()),
    currentBalance: v.union(v.number(), v.null()),
    availableBalance: v.union(v.number(), v.null()),
    isoCurrencyCode: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_accountId", ["userId", "accountId"])
    .index("by_userId_institutionId", ["userId", "institutionId"]),

  loanTerms: defineTable({
    userId,
    accountId: v.string(),
    principalStart: v.number(),
    annualRate: v.number(),
    aprDisclosed: v.union(v.number(), v.null()),
    paymentAmount: v.number(),
    paymentFrequency: v.string(),
    paymentCount: v.number(),
    firstPaymentDate: v.string(),
    maturityDate: v.string(),
    matchMerchantClean: v.string(),
    matchAmount: v.number(),
    principalOverride: v.union(v.number(), v.null()),
    overrideAsOf: v.union(v.string(), v.null()),
    /** auto | mortgage | student | personal | heloc | other - optional for legacy rows. */
    loanType: v.optional(v.string()),
    /** fixed | variable - optional for legacy rows (defaults to fixed). */
    rateType: v.optional(v.string()),
    /** Collateral / asset note (vehicle, property, school, etc.). */
    vehicleLabel: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_accountId", ["userId", "accountId"]),

  loanPaymentLinks: defineTable({
    userId,
    loanAccountId: v.string(),
    paymentNumber: v.number(),
    scheduledDate: v.string(),
    postedDate: v.union(v.string(), v.null()),
    transactionId: v.union(v.string(), v.null()),
    paymentAmount: v.number(),
    interestPortion: v.number(),
    principalPortion: v.number(),
    balanceAfter: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_loanAccountId", ["userId", "loanAccountId"])
    .index("by_userId_loanAccountId_paymentNumber", [
      "userId",
      "loanAccountId",
      "paymentNumber",
    ]),

  statementUploads: defineTable({
    userId,
    /** Turso integer PK - keeps statement detail URLs stable. */
    uploadId: v.number(),
    filename: v.string(),
    fileHash: v.union(v.string(), v.null()),
    status: v.string(),
    accountId: v.union(v.string(), v.null()),
    institutionName: v.union(v.string(), v.null()),
    accountName: v.union(v.string(), v.null()),
    accountMask: v.union(v.string(), v.null()),
    currency: v.union(v.string(), v.null()),
    pageCount: v.union(v.number(), v.null()),
    transactionCount: v.union(v.number(), v.null()),
    insertedCount: v.union(v.number(), v.null()),
    updatedCount: v.union(v.number(), v.null()),
    skippedCount: v.union(v.number(), v.null()),
    statementPeriodStart: v.union(v.string(), v.null()),
    statementPeriodEnd: v.union(v.string(), v.null()),
    openingBalance: v.union(v.number(), v.null()),
    closingBalance: v.union(v.number(), v.null()),
    totalDebits: v.union(v.number(), v.null()),
    totalCredits: v.union(v.number(), v.null()),
    transactionSum: v.union(v.number(), v.null()),
    computedClosing: v.union(v.number(), v.null()),
    balanceDelta: v.union(v.number(), v.null()),
    balanceOk: v.union(v.boolean(), v.null()),
    ocrStorageId: v.optional(v.id("_storage")),
    ocrMarkdown: v.optional(v.union(v.string(), v.null())),
    error: v.union(v.string(), v.null()),
    createdAt: v.number(),
    completedAt: v.union(v.number(), v.null()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_fileHash", ["userId", "fileHash"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_userId_uploadId", ["userId", "uploadId"]),

  transactionSections: defineTable({
    userId,
    legacyId: v.number(),
    name: v.string(),
    description: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_name", ["userId", "name"])
    .index("by_userId_legacyId", ["userId", "legacyId"]),

  transactionSpreads: defineTable({
    userId,
    legacyId: v.number(),
    name: v.string(),
    targetPercent: v.number(),
    description: v.string(),
    sortOrder: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_name", ["userId", "name"])
    .index("by_userId_legacyId", ["userId", "legacyId"]),

  transactionCategories: defineTable({
    userId,
    legacyId: v.number(),
    name: v.string(),
    sectionLegacyId: v.union(v.number(), v.null()),
    description: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_name", ["userId", "name"])
    .index("by_userId_legacyId", ["userId", "legacyId"]),

  transactionSubcategories: defineTable({
    userId,
    legacyId: v.number(),
    name: v.string(),
    categoryLegacyId: v.union(v.number(), v.null()),
    description: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_name", ["userId", "name"])
    .index("by_userId_legacyId", ["userId", "legacyId"]),

  transactionTypes: defineTable({
    userId,
    legacyId: v.number(),
    name: v.string(),
    description: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_name", ["userId", "name"])
    .index("by_userId_legacyId", ["userId", "legacyId"]),

  transactionKinds: defineTable({
    userId,
    legacyId: v.number(),
    name: v.string(),
    description: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_name", ["userId", "name"])
    .index("by_userId_legacyId", ["userId", "legacyId"]),

  /**
   * Normalized merchant entities per user.
   * Transactions keep denormalized merchantClean/company/brand for reads,
   * and optionally point here via merchantId.
   */
  merchants: defineTable({
    userId,
    /** Stable unique key per user (slug of canonical name). */
    slug: v.string(),
    /** Canonical display name (merchantClean). */
    name: v.string(),
    /** Last raw bank / OCR merchant label. */
    rawName: v.union(v.string(), v.null()),
    company: v.union(v.string(), v.null()),
    brand: v.union(v.string(), v.null()),
    website: v.union(v.string(), v.null()),
    logoUrl: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_slug", ["userId", "slug"])
    .index("by_userId_name", ["userId", "name"]),

  transactions: defineTable({
    userId,
    transactionId: v.string(),
    posted: v.string(),
    authorized: v.union(v.string(), v.null()),
    account: v.union(v.string(), v.null()),
    accountId: v.string(),
    description: v.string(),
    originalDescription: v.union(v.string(), v.null()),
    /** Optional FK into merchants (denormalized strings remain for charts). */
    merchantId: v.optional(v.union(v.id("merchants"), v.null())),
    merchantClean: v.union(v.string(), v.null()),
    merchantName: v.union(v.string(), v.null()),
    company: v.union(v.string(), v.null()),
    brand: v.union(v.string(), v.null()),
    section: v.union(v.string(), v.null()),
    category: v.union(v.string(), v.null()),
    subcategory: v.union(v.string(), v.null()),
    spread: v.union(v.string(), v.null()),
    transactionType: v.union(v.string(), v.null()),
    /** @deprecated Folded into txnCode. Kept null for old docs. */
    kind: v.union(v.string(), v.null()),
    sectionLegacyId: v.union(v.number(), v.null()),
    categoryLegacyId: v.union(v.number(), v.null()),
    subcategoryLegacyId: v.union(v.number(), v.null()),
    spreadLegacyId: v.union(v.number(), v.null()),
    transactionTypeLegacyId: v.union(v.number(), v.null()),
    kindLegacyId: v.union(v.number(), v.null()),
    tags: v.union(v.string(), v.null()),
    channel: v.union(v.string(), v.null()),
    /** Line nature: purchase / payment / fee / subscription / … */
    txnCode: v.union(v.string(), v.null()),
    bankDirection: v.union(v.string(), v.null()),
    crossCheck: v.union(v.string(), v.null()),
    enrichment: v.union(v.string(), v.null()),
    source: v.union(v.string(), v.null()),
    /** Links statement-sourced rows to statementUploads.uploadId for safe delete. */
    statementUploadId: v.optional(v.union(v.number(), v.null())),
    pending: v.boolean(),
    city: v.union(v.string(), v.null()),
    region: v.union(v.string(), v.null()),
    country: v.union(v.string(), v.null()),
    website: v.union(v.string(), v.null()),
    logoUrl: v.union(v.string(), v.null()),
    currency: v.string(),
    debit: v.union(v.number(), v.null()),
    credit: v.union(v.number(), v.null()),
    amount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_transactionId", ["userId", "transactionId"])
    .index("by_userId_posted", ["userId", "posted"])
    .index("by_userId_accountId_posted", ["userId", "accountId", "posted"])
    .index("by_userId_merchantId", ["userId", "merchantId"])
    .index("by_userId_statementUploadId", ["userId", "statementUploadId"]),

  appModules: defineTable({
    userId,
    legacyId: v.number(),
    slug: v.string(),
    name: v.string(),
    description: v.union(v.string(), v.null()),
    href: v.string(),
    icon: v.string(),
    category: v.string(),
    enabled: v.boolean(),
    sortOrder: v.number(),
    isCore: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_slug", ["userId", "slug"]),

  /** Scratch note pads (tabs + vendor rows) for Analysis + FAB. */
  scratchNotes: defineTable({
    userId,
    tabs: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        rows: v.array(
          v.object({
            id: v.string(),
            name: v.string(),
            spend: v.number(),
            count: v.number(),
            currency: v.string(),
            parent: v.optional(v.string()),
          }),
        ),
      }),
    ),
    activeId: v.string(),
    receiveId: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /** Freeform note tabs (Utilitek-style text pads). */
  userNotes: defineTable({
    userId,
    tabId: v.string(),
    tabName: v.string(),
    content: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_tabId", ["userId", "tabId"]),

  /** Per-user AI preferences for that owner's statement PDF imports only. */
  userAiRules: defineTable({
    userId,
    rules: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /** Client-reported errors (Error Boundary + manual). */
  issues: defineTable({
    userId,
    message: v.string(),
    stack: v.union(v.string(), v.null()),
    componentStack: v.union(v.string(), v.null()),
    url: v.union(v.string(), v.null()),
    userNote: v.union(v.string(), v.null()),
    status: v.union(
      v.literal("open"),
      v.literal("resolved"),
      v.literal("dismissed"),
    ),
    source: v.union(v.literal("error_boundary"), v.literal("manual")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_status", ["status"]),
});
