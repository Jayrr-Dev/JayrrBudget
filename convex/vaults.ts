import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireUser } from "./lib/auth";

async function sweepDeletedRecords(
  ctx: MutationCtx,
  userId: Id<"users">,
  vaultId: string,
) {
  const leftovers = await ctx.db
    .query("encryptedRecords")
    .withIndex("by_userId_vaultId", (q) =>
      q.eq("userId", userId).eq("vaultId", vaultId),
    )
    .take(500);
  let removed = 0;
  for (const row of leftovers) {
    if (!row.deleted) continue;
    await ctx.db.delete(row._id);
    removed += 1;
  }
  return removed;
}

const modeValidator = v.union(
  v.literal("STRICT_PRIVATE"),
  v.literal("CLOUD_PROCESSING"),
);
const statusValidator = v.union(
  v.literal("active"),
  v.literal("migrating"),
  v.literal("locked"),
);
const argon2Validator = v.object({
  algorithm: v.literal("argon2id"),
  version: v.number(),
  timeCost: v.number(),
  memoryCost: v.number(),
  parallelism: v.number(),
  hashLength: v.number(),
});

export const get = query({
  args: {},
  returns: v.union(
    v.object({
      vaultId: v.string(),
      mode: modeValidator,
      status: statusValidator,
      currentKeyId: v.string(),
      passphraseWrappedMasterKey: v.bytes(),
      passphraseSalt: v.bytes(),
      recoveryWrappedMasterKey: v.bytes(),
      recoverySalt: v.bytes(),
      argon2: argon2Validator,
      passkeyWrappedMasterKey: v.union(v.bytes(), v.null()),
      passkeyCredentialId: v.union(v.string(), v.null()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const vault = await ctx.db
      .query("vaults")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!vault) return null;
    return {
      vaultId: vault.vaultId,
      mode: vault.mode,
      status: vault.status,
      currentKeyId: vault.currentKeyId,
      passphraseWrappedMasterKey: vault.passphraseWrappedMasterKey,
      passphraseSalt: vault.passphraseSalt,
      recoveryWrappedMasterKey: vault.recoveryWrappedMasterKey,
      recoverySalt: vault.recoverySalt,
      argon2: {
        algorithm: "argon2id" as const,
        version: vault.argon2Version,
        timeCost: vault.argon2TimeCost,
        memoryCost: vault.argon2MemoryCost,
        parallelism: vault.argon2Parallelism,
        hashLength: vault.argon2HashLength,
      },
      passkeyWrappedMasterKey: vault.passkeyWrappedMasterKey ?? null,
      passkeyCredentialId: vault.passkeyCredentialId ?? null,
      createdAt: vault.createdAt,
      updatedAt: vault.updatedAt,
    };
  },
});

export const create = mutation({
  args: {
    vaultId: v.string(),
    mode: modeValidator,
    currentKeyId: v.string(),
    passphraseWrappedMasterKey: v.bytes(),
    passphraseSalt: v.bytes(),
    recoveryWrappedMasterKey: v.bytes(),
    recoverySalt: v.bytes(),
    argon2: argon2Validator,
  },
  returns: v.object({ vaultId: v.string(), created: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("vaults")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (existing) return { vaultId: existing.vaultId, created: false };
    const now = Date.now();
    await ctx.db.insert("vaults", {
      userId: user._id,
      vaultId: args.vaultId,
      mode: args.mode,
      status: "active",
      currentKeyId: args.currentKeyId,
      passphraseWrappedMasterKey: args.passphraseWrappedMasterKey,
      passphraseSalt: args.passphraseSalt,
      recoveryWrappedMasterKey: args.recoveryWrappedMasterKey,
      recoverySalt: args.recoverySalt,
      argon2Version: args.argon2.version,
      argon2TimeCost: args.argon2.timeCost,
      argon2MemoryCost: args.argon2.memoryCost,
      argon2Parallelism: args.argon2.parallelism,
      argon2HashLength: args.argon2.hashLength,
      createdAt: now,
      updatedAt: now,
    });
    return { vaultId: args.vaultId, created: true };
  },
});

export const setPasskeyPackage = mutation({
  args: { credentialId: v.string(), wrappedMasterKey: v.bytes() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const vault = await ctx.db
      .query("vaults")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!vault) throw new Error("Encryption is not set up");
    await ctx.db.patch(vault._id, {
      passkeyCredentialId: args.credentialId,
      passkeyWrappedMasterKey: args.wrappedMasterKey,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setPassphrasePackage = mutation({
  args: {
    passphraseWrappedMasterKey: v.bytes(),
    passphraseSalt: v.bytes(),
    argon2: argon2Validator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const vault = await ctx.db
      .query("vaults")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!vault) throw new Error("Encryption is not set up");
    await ctx.db.patch(vault._id, {
      passphraseWrappedMasterKey: args.passphraseWrappedMasterKey,
      passphraseSalt: args.passphraseSalt,
      argon2Version: args.argon2.version,
      argon2TimeCost: args.argon2.timeCost,
      argon2MemoryCost: args.argon2.memoryCost,
      argon2Parallelism: args.argon2.parallelism,
      argon2HashLength: args.argon2.hashLength,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const rotateUnlockPackages = mutation({
  args: {
    passphraseWrappedMasterKey: v.bytes(),
    passphraseSalt: v.bytes(),
    recoveryWrappedMasterKey: v.bytes(),
    recoverySalt: v.bytes(),
    argon2: argon2Validator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const vault = await ctx.db
      .query("vaults")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!vault) throw new Error("Encryption is not set up");
    await ctx.db.patch(vault._id, {
      passphraseWrappedMasterKey: args.passphraseWrappedMasterKey,
      passphraseSalt: args.passphraseSalt,
      recoveryWrappedMasterKey: args.recoveryWrappedMasterKey,
      recoverySalt: args.recoverySalt,
      argon2Version: args.argon2.version,
      argon2TimeCost: args.argon2.timeCost,
      argon2MemoryCost: args.argon2.memoryCost,
      argon2Parallelism: args.argon2.parallelism,
      argon2HashLength: args.argon2.hashLength,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const saveRecords = mutation({
  args: {
    vaultId: v.string(),
    records: v.array(
      v.object({
        recordId: v.string(),
        kind: v.string(),
        v: v.number(),
        alg: v.string(),
        keyId: v.string(),
        iv: v.bytes(),
        wrappedDek: v.bytes(),
        ciphertext: v.bytes(),
        expectedRevision: v.union(v.number(), v.null()),
        deleted: v.boolean(),
      }),
    ),
  },
  returns: v.object({
    saved: v.number(),
    revisions: v.array(
      v.object({ recordId: v.string(), revision: v.number() }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const vault = await ctx.db
      .query("vaults")
      .withIndex("by_userId_vaultId", (q) =>
        q.eq("userId", user._id).eq("vaultId", args.vaultId),
      )
      .unique();
    if (!vault) throw new Error("Encryption is not set up");
    const now = Date.now();
    const revisions: Array<{ recordId: string; revision: number }> = [];
    const pending = new Map<string, (typeof args.records)[number]>();
    for (const record of args.records) pending.set(record.recordId, record);
    for (const record of pending.values()) {
      const existing = await ctx.db
        .query("encryptedRecords")
        .withIndex("by_userId_vaultId_recordId", (q) =>
          q
            .eq("userId", user._id)
            .eq("vaultId", args.vaultId)
            .eq("recordId", record.recordId),
        )
        .unique();
      if (record.deleted) {
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }
      if (
        existing &&
        record.expectedRevision !== null &&
        record.expectedRevision !== existing.revision
      ) {
        throw new Error(`Encrypted record conflict: ${record.recordId}`);
      }
      if (!existing && record.expectedRevision !== null)
        throw new Error(`Encrypted record missing: ${record.recordId}`);
      const next = {
        userId: user._id,
        vaultId: args.vaultId,
        recordId: record.recordId,
        kind: record.kind,
        v: record.v,
        alg: record.alg,
        keyId: record.keyId,
        iv: record.iv,
        wrappedDek: record.wrappedDek,
        ciphertext: record.ciphertext,
        revision: (existing?.revision ?? 0) + 1,
        deleted: false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, next);
      else await ctx.db.insert("encryptedRecords", next);
      revisions.push({ recordId: record.recordId, revision: next.revision });
    }
    await sweepDeletedRecords(ctx, user._id, args.vaultId);
    await ctx.db.patch(vault._id, { updatedAt: now });
    return { saved: args.records.length, revisions };
  },
});

export const deleteRecords = mutation({
  args: { vaultId: v.string(), recordIds: v.array(v.string()) },
  returns: v.object({ removed: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const vault = await ctx.db
      .query("vaults")
      .withIndex("by_userId_vaultId", (q) =>
        q.eq("userId", user._id).eq("vaultId", args.vaultId),
      )
      .unique();
    if (!vault) throw new Error("Encryption is not set up");
    let removed = 0;
    for (const recordId of args.recordIds) {
      const existing = await ctx.db
        .query("encryptedRecords")
        .withIndex("by_userId_vaultId_recordId", (q) =>
          q
            .eq("userId", user._id)
            .eq("vaultId", args.vaultId)
            .eq("recordId", recordId),
        )
        .unique();
      if (!existing) continue;
      await ctx.db.delete(existing._id);
      removed += 1;
    }
    removed += await sweepDeletedRecords(ctx, user._id, args.vaultId);
    await ctx.db.patch(vault._id, { updatedAt: Date.now() });
    return { removed };
  },
});

export const listRecords = query({
  args: { vaultId: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("encryptedRecords")
      .withIndex("by_userId_vaultId_updatedAt", (q) =>
        q.eq("userId", user._id).eq("vaultId", args.vaultId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/** Hard-delete tombstones so a later import can reuse the same recordIds. */
export const purgeDeletedRecords = internalMutation({
  args: {},
  returns: v.object({ removed: v.number() }),
  handler: async (ctx) => {
    const rows = await ctx.db.query("encryptedRecords").take(500);
    let removed = 0;
    for (const row of rows) {
      if (!row.deleted) continue;
      await ctx.db.delete(row._id);
      removed += 1;
    }
    return { removed };
  },
});
