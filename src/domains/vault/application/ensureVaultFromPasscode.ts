import { api } from "@convex/_generated/api";
import { rememberDeviceUnlock, unlockMasterKeyFromDevice } from "@/crypto/deviceUnlock";
import { randomBytes, toArrayBuffer } from "@/crypto/bytes";
import { DEFAULT_ARGON2_PARAMS } from "@/crypto/kdf";
import { createVaultKeyMaterial, unwrapMasterKey, wrapMasterKey } from "@/crypto/masterKey";
import { createRecoveryFile, downloadRecoveryFile } from "@/crypto/recovery";
import { getVaultMasterKey, unlockVault } from "@/crypto/session";

export const MIN_PASSCODE_LENGTH = 8;

export type VaultUnlockRecord = {
  vaultId: string;
  passphraseWrappedMasterKey: ArrayBuffer;
  passphraseSalt: ArrayBuffer;
  recoveryWrappedMasterKey: ArrayBuffer;
  recoverySalt: ArrayBuffer;
  argon2: {
    algorithm: "argon2id";
    version: number;
    timeCost: number;
    memoryCost: number;
    parallelism: number;
    hashLength: number;
  };
};

export type VaultClient = {
  query: (reference: unknown, args: unknown) => Promise<VaultUnlockRecord | null>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
};

export function assertPasscode(passcode: string) {
  if (passcode.length < MIN_PASSCODE_LENGTH) {
    throw new Error(`Use a password with at least ${MIN_PASSCODE_LENGTH} characters.`);
  }
}

export async function commitVaultUnlock(vaultId: string, masterKey: CryptoKey) {
  unlockVault(masterKey);
  await rememberDeviceUnlock(vaultId, masterKey);
}

export async function unlockVaultWithPasscode(vault: VaultUnlockRecord, passcode: string) {
  try {
    await commitVaultUnlock(
      vault.vaultId,
      await unwrapMasterKey(
        vault.passphraseWrappedMasterKey,
        passcode,
        new Uint8Array(vault.passphraseSalt),
        vault.argon2,
      ),
    );
    return true;
  } catch {
    return false;
  }
}

export async function relinkVaultPasscode(
  client: VaultClient,
  vault: VaultUnlockRecord,
  masterKey: CryptoKey,
  passcode: string,
) {
  assertPasscode(passcode);
  const passphraseSalt = randomBytes(16);
  await client.mutation(api.vaults.setPassphrasePackage, {
    passphraseWrappedMasterKey: await wrapMasterKey(masterKey, passcode, passphraseSalt),
    passphraseSalt: toArrayBuffer(passphraseSalt),
    argon2: DEFAULT_ARGON2_PARAMS,
  });
  await rememberDeviceUnlock(vault.vaultId, masterKey);
}

export async function rewrapVaultWithPasscode(
  client: VaultClient,
  vault: VaultUnlockRecord,
  masterKey: CryptoKey,
  passcode: string,
) {
  assertPasscode(passcode);
  const passphraseSalt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const recoverySecret = randomBytes(32);
  await client.mutation(api.vaults.rotateUnlockPackages, {
    passphraseWrappedMasterKey: await wrapMasterKey(masterKey, passcode, passphraseSalt),
    passphraseSalt: toArrayBuffer(passphraseSalt),
    recoveryWrappedMasterKey: await wrapMasterKey(masterKey, recoverySecret, recoverySalt),
    recoverySalt: toArrayBuffer(recoverySalt),
    argon2: DEFAULT_ARGON2_PARAMS,
  });
  downloadRecoveryFile(createRecoveryFile(vault.vaultId, recoverySecret));
}

export async function createVaultWithPasscode(client: VaultClient, passcode: string) {
  assertPasscode(passcode);
  const material = await createVaultKeyMaterial(passcode);
  const vaultId = crypto.randomUUID();
  const result = (await client.mutation(api.vaults.create, {
    vaultId,
    mode: "STRICT_PRIVATE",
    currentKeyId: crypto.randomUUID(),
    passphraseWrappedMasterKey: material.passphraseWrapped,
    passphraseSalt: toArrayBuffer(material.passphraseSalt),
    recoveryWrappedMasterKey: material.recoveryWrapped,
    recoverySalt: toArrayBuffer(material.recoverySalt),
    argon2: material.argon2,
  })) as { vaultId: string; created: boolean };

  if (result.created) {
    downloadRecoveryFile(createRecoveryFile(vaultId, material.recoverySecret));
    await commitVaultUnlock(vaultId, material.masterKey);
    return "created" as const;
  }

  const existing = await client.query(api.vaults.get, {});
  if (!existing) throw new Error("Encryption was not set up.");
  const unlocked = await unlockVaultWithPasscode(existing, passcode);
  if (!unlocked) throw new Error("Could not open the ledger with this password.");
  return "unlocked" as const;
}

export type HydratedVault = {
  vaultId: string;
  keyId: string;
};

/** Opens the vault from this browser's device wrap. No extra password prompt. */
export async function hydrateVaultSession(client: VaultClient): Promise<HydratedVault | null> {
  const vault = await client.query(api.vaults.get, {}) as (VaultUnlockRecord & { currentKeyId?: string }) | null;
  if (!vault) return null;
  if (!getVaultMasterKey()) {
    const deviceKey = await unlockMasterKeyFromDevice(vault.vaultId);
    if (!deviceKey) return null;
    unlockVault(deviceKey);
  }
  if (!vault.currentKeyId) return null;
  return { vaultId: vault.vaultId, keyId: vault.currentKeyId };
}

/** Creates a vault on first sign-in, or unlocks with the same password used to sign in. */
export async function ensureVaultFromPasscode(client: VaultClient, passcode: string) {
  assertPasscode(passcode);
  const vault = await client.query(api.vaults.get, {});
  if (!vault) return createVaultWithPasscode(client, passcode);
  const unlocked = await unlockVaultWithPasscode(vault, passcode);
  if (unlocked) return "unlocked" as const;
  const deviceKey = await unlockMasterKeyFromDevice(vault.vaultId);
  if (!deviceKey) return "mismatch" as const;
  unlockVault(deviceKey);
  await relinkVaultPasscode(client, vault, deviceKey, passcode);
  return "relinked" as const;
}
