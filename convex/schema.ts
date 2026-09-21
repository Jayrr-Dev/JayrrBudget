import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { profileValidator } from "./lib/categorization";
import { userIconValidator } from "./lib/userIcons";

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
  // Shared vocabulary contains labels only, never ledger rows or owner IDs.
  sharedCategoryPaths: defineTable({
    key: v.string(),
    section: v.string(),
    category: v.string(),
    subcategory: v.union(v.string(), v.null()),
  }).index("by_key", ["key"]),
  sharedTags: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.string(),
  }).index("by_key", ["key"]),
  transactionTags: defineTable({
    userId,
    name: v.string(),
    description: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_name", ["userId", "name"]),
  categorizationRules: defineTable({
    userId: v.id("users"),
    key: v.string(),
    profile: profileValidator,
    updatedAt: v.number(),
  }).index("by_userId_key", ["userId", "key"]),
  /** Zero-knowledge vault metadata. Wrapped keys are ciphertext and never plaintext UMKs. */
  vaults: defineTable({
    userId: v.id("users"),
    vaultId: v.string(),
    mode: v.union(v.literal("STRICT_PRIVATE"), v.literal("CLOUD_PROCESSING")),
    status: v.union(
      v.literal("active"),
      v.literal("migrating"),
      v.literal("locked"),
    ),
    currentKeyId: v.string(),
    passphraseWrappedMasterKey: v.bytes(),
    passphraseSalt: v.bytes(),
    recoveryWrappedMasterKey: v.bytes(),
    recoverySalt: v.bytes(),
    argon2Version: v.number(),
    argon2TimeCost: v.number(),
    argon2MemoryCost: v.number(),
    argon2Parallelism: v.number(),
    argon2HashLength: v.number(),
    passkeyWrappedMasterKey: v.optional(v.bytes()),
    passkeyCredentialId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_vaultId", ["userId", "vaultId"]),
  /** Encrypted records only. Sensitive values belong inside ciphertext. */
  encryptedRecords: defineTable({
    userId: v.id("users"),
    vaultId: v.string(),
    recordId: v.string(),
    kind: v.string(),
    v: v.number(),
    alg: v.string(),
    keyId: v.string(),
    iv: v.bytes(),
    wrappedDek: v.bytes(),
    ciphertext: v.bytes(),
    revision: v.number(),
    deleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_vaultId", ["userId", "vaultId"])
    .index("by_userId_vaultId_recordId", ["userId", "vaultId", "recordId"])
    .index("by_userId_vaultId_updatedAt", ["userId", "vaultId", "updatedAt"]),
  /** Encrypted original statements and exports. Large files use Convex storageId. */
  encryptedDocuments: defineTable({
    userId: v.id("users"),
    vaultId: v.string(),
    documentId: v.string(),
    storageId: v.optional(v.id("_storage")),
    contentType: v.string(),
    byteLength: v.number(),
    keyId: v.string(),
    iv: v.bytes(),
    wrappedDek: v.bytes(),
    ciphertext: v.optional(v.bytes()),
    revision: v.number(),
    deleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_vaultId", ["userId", "vaultId"])
    .index("by_userId_vaultId_documentId", ["userId", "vaultId", "documentId"]),
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
      v.union(v.literal("admin"), v.literal("normal"), v.literal("premium")),
    ),
    /** Document OCR: local (device) or server. Defaults to server when missing. */
    ocrMode: v.optional(v.union(v.literal("local"), v.literal("server"))),
    /** Chat avatar under public/user/. Defaults to jay when missing. */
    avatarIcon: v.optional(userIconValidator),
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
    /** Nickname shown in the UI. Does not replace name or accountId. */
    label: v.optional(v.union(v.string(), v.null())),
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
    /** Substring on the bank transaction description used to attach PAD payments. */
    txnDescriptionLookup: v.optional(v.union(v.string(), v.null())),
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

  /** Loan contract / disclosure PDF parses (OCR kept for later View OCR). */
  loanDocumentUploads: defineTable({
    userId,
    uploadId: v.number(),
    filename: v.string(),
    fileHash: v.union(v.string(), v.null()),
    status: v.string(),
    pageCount: v.union(v.number(), v.null()),
    accountId: v.union(v.string(), v.null()),
    ocrMarkdown: v.optional(v.union(v.string(), v.null())),
    name: v.union(v.string(), v.null()),
    loanType: v.union(v.string(), v.null()),
    rateType: v.union(v.string(), v.null()),
    vehicleLabel: v.union(v.string(), v.null()),
    principalStart: v.union(v.number(), v.null()),
    annualRatePct: v.union(v.number(), v.null()),
    paymentAmount: v.union(v.number(), v.null()),
    paymentFrequency: v.union(v.string(), v.null()),
    paymentCount: v.union(v.number(), v.null()),
    firstPaymentDate: v.union(v.string(), v.null()),
    matchMerchantClean: v.union(v.string(), v.null()),
    txnDescriptionLookup: v.optional(v.union(v.string(), v.null())),
    institutionName: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    createdAt: v.number(),
    completedAt: v.union(v.number(), v.null()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_fileHash", ["userId", "fileHash"])
    .index("by_userId_accountId", ["userId", "accountId"])
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
    logoStorageId: v.optional(v.id("_storage")),
    /** Cached linked transaction count. Maintained on write; backfill via syncTransactionCounts. */
    transactionCount: v.optional(v.number()),
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
    /** Original purchase currency when the line is FX (e.g. PHP, USD). */
    foreignCurrency: v.optional(v.union(v.string(), v.null())),
    /** Original amount in foreignCurrency when printed on the statement. */
    foreignAmount: v.optional(v.union(v.number(), v.null())),
    /** Statement FX rate when printed (e.g. 0.024 on `PHP @ 0.024`). */
    exchangeRate: v.optional(v.union(v.number(), v.null())),
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

  /** Per-user flags (encrypted ledger, cloud processing consent). */
  featureFlags: defineTable({
    userId: v.id("users"),
    key: v.string(),
    enabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_key", ["userId", "key"]),

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

  /** Per-user Excalidraw scene (serializeAsJSON string). One doc per user. */
  canvasScenes: defineTable({
    userId: v.id("users"),
    sceneJson: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /**
   * Piggy crew: helper piggies and mail between them.
   * Every row is locked to the signed-in user. Client never supplies userId.
   * kind "helper": at most two per chat (slot 1 or 2).
   * kind "mail": messages lead <-> helper for that chat.
   */
  piggyCrew: defineTable({
    userId: v.id("users"),
    chatId: v.string(),
    kind: v.union(v.literal("helper"), v.literal("mail")),
    slot: v.optional(v.union(v.literal("1"), v.literal("2"))),
    name: v.optional(v.string()),
    brief: v.optional(v.string()),
    fromSlot: v.optional(
      v.union(v.literal("lead"), v.literal("1"), v.literal("2")),
    ),
    toSlot: v.optional(
      v.union(v.literal("lead"), v.literal("1"), v.literal("2")),
    ),
    body: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId_chatId", ["userId", "chatId"])
    .index("by_userId_chatId_kind", ["userId", "chatId", "kind"]),

  /**
   * Piggy's memory. One row per user; only the signed-in owner can read or write.
   * Holds what Piggy learned about the person, not ledger rows.
   */
  piggyMemory: defineTable({
    userId: v.id("users"),
    /** Piggy's chosen nickname when the real name is hard to use. Null = use first name. */
    nickname: v.union(v.string(), v.null()),
    /** Household, job, location, pay cadence, currency: short facts about the person. */
    basicInfo: v.array(v.string()),
    /** Money goals, in the user's words. */
    goals: v.array(v.string()),
    /** Struggles and stress points around money or the app. */
    painPoints: v.array(v.string()),
    /** How they like Piggy to talk and what to avoid. */
    preferences: v.array(v.string()),
    /** Wins worth remembering and celebrating later. */
    wins: v.array(v.string()),
    /** Things to check on next session. */
    followUps: v.array(v.string()),
    /** One-line summary of the last chat. */
    lastSessionSummary: v.union(v.string(), v.null()),
    lastSessionAt: v.union(v.number(), v.null()),
    lastSessionScope: v.union(
      v.literal("ledger"),
      v.literal("canvas"),
      v.null(),
    ),
    sessionCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /**
   * Pings: owner-scoped reminders. Empty startDate or endDate means
   * that bound is indefinite. trigger names budget events
   * (`Name + Warn`, `Name + Warn + Over`). Cycle `None` has no calendar
   * date; linked budget events can still fire it.
   */
  piggyPings: defineTable({
    userId: v.id("users"),
    name: v.string(),
    title: v.string(),
    message: v.string(),
    /** PiggyIcon artwork key; defaults to "pings" when missing. */
    icon: v.optional(v.string()),
    pingType: v.union(
      v.literal("Toast"),
      v.literal("Email"),
      v.literal("Popup"),
      v.literal("Banner"),
    ),
    pingTypes: v.optional(
      v.array(
        v.union(
          v.literal("Toast"),
          v.literal("Email"),
          v.literal("Popup"),
          v.literal("Banner"),
        ),
      ),
    ),
    cycle: v.string(),
    trigger: v.union(v.string(), v.null()),
    triggerCount: v.number(),
    firedKeys: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
    startDate: v.union(v.string(), v.null()),
    endDate: v.union(v.string(), v.null()),
    notes: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /**
   * Spend caps. classLookup / descriptionLookup are name fragments for
   * later matching against classifications and ledger descriptions.
   * warningThreshold / overageThreshold are percent of amount (0–100+).
   * pingLinks: Pings that fire on warn / over.
   */
  budgets: defineTable({
    userId: v.id("users"),
    name: v.string(),
    classLookup: v.union(v.string(), v.null()),
    descriptionLookup: v.union(v.string(), v.null()),
    amount: v.number(),
    warningThreshold: v.number(),
    overageThreshold: v.number(),
    isActive: v.boolean(),
    /** daily | weekly | biweekly | monthly | yearly. Missing = monthly. */
    cycle: v.optional(v.string()),
    /** YYYY-MM-DD. Slice repeats from this day. Missing = created day. */
    startDate: v.optional(v.union(v.string(), v.null())),
    pingLinks: v.optional(
      v.array(
        v.object({
          pingId: v.id("piggyPings"),
          warn: v.boolean(),
          over: v.boolean(),
        }),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /** Per-user AI preferences for that owner's statement PDF imports only. */
  userAiRules: defineTable({
    userId,
    rules: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /**
   * BYOK ciphertext only. Plaintext never enters Convex.
   * Next.js encrypts with AI_BYOK_WRAP_KEY before putEncrypted.
   */
  userAiKeys: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("openrouter"), v.literal("jev")),
    ciphertext: v.string(),
    iv: v.string(),
    last4: v.string(),
    updatedAt: v.number(),
  }).index("by_userId_provider", ["userId", "provider"]),

  /** One AI / OCR call. Cost is estimated from convex/lib/aiCostTable. */
  aiUsageEvents: defineTable({
    userId: v.id("users"),
    source: v.string(),
    modelId: v.string(),
    billedTo: v.union(v.literal("platform"), v.literal("byok")),
    inputTokens: v.union(v.number(), v.null()),
    outputTokens: v.union(v.number(), v.null()),
    totalTokens: v.union(v.number(), v.null()),
    pages: v.union(v.number(), v.null()),
    estimatedUsd: v.union(v.number(), v.null()),
    ms: v.union(v.number(), v.null()),
    createdAt: v.number(),
  }).index("by_userId_createdAt", ["userId", "createdAt"]),

  /** Per user / UTC month / who paid (app key vs user BYOK). */
  aiUsageMonths: defineTable({
    userId: v.id("users"),
    monthKey: v.string(),
    billedTo: v.union(v.literal("platform"), v.literal("byok")),
    callCount: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    pages: v.number(),
    estimatedUsd: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_monthKey_billedTo", ["userId", "monthKey", "billedTo"])
    .index("by_monthKey", ["monthKey"]),

  /**
   * App-wide default OpenRouter model. One row, key "default".
   * Catalog ids live in convex/lib/openRouterModels.ts.
   */
  serviceAiConfig: defineTable({
    key: v.literal("default"),
    primaryModelId: v.string(),
    fallbackModelIds: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /** Per-role AI plan: price, monthly platform cap, request rate. */
  servicePlans: defineTable({
    role: v.union(
      v.literal("admin"),
      v.literal("normal"),
      v.literal("premium"),
    ),
    name: v.string(),
    priceUsd: v.number(),
    monthlyCapUsd: v.union(v.number(), v.null()),
    rateMax: v.number(),
    rateWindowMs: v.number(),
    includedCanvas: v.boolean(),
    updatedAt: v.number(),
  }).index("by_role", ["role"]),

  /** Sliding AI request window per user (rate limit). */
  aiRateWindows: defineTable({
    userId: v.id("users"),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_userId", ["userId"]),

  /**
   * One row per user per UTC day. Heartbeats add activeMs while the app
   * is visible. Used for DAU / time-in-app on the Users dashboard.
   */
  usageDays: defineTable({
    userId: v.id("users"),
    dayKey: v.string(),
    activeMs: v.number(),
    ticks: v.number(),
    lastHeartbeatAt: v.number(),
  })
    .index("by_userId_dayKey", ["userId", "dayKey"])
    .index("by_dayKey", ["dayKey"]),

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
