import { unwrapMasterKey } from "@/crypto/masterKey";
import {
  commitVaultUnlock,
  relinkVaultPasscode,
  type VaultClient,
  type VaultUnlockRecord,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import { api } from "@convex/_generated/api";

const MIN_PASSWORD_LENGTH = 8;

type PasswordClient = VaultClient & {
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

function passwordError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Could not change the password.";
  const marker = "Uncaught Error: ";
  const index = raw.lastIndexOf(marker);
  return index === -1 ? raw : raw.slice(index + marker.length);
}

/**
 * Point the same vault key at a new password, then update sign-in.
 * Ledger rows stay ciphertext under the old key. A failed sign-in update
 * puts the previous password wrapper back.
 */
export async function changePasswordKeepingVault(
  client: PasswordClient,
  oldPassword: string,
  newPassword: string,
) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (oldPassword === newPassword) {
    throw new Error("Choose a different password.");
  }

  const vault = (await client.query(api.vaults.get, {})) as VaultUnlockRecord | null;
  let masterKey: CryptoKey | null = null;
  if (vault) {
    try {
      masterKey = await unwrapMasterKey(
        vault.passphraseWrappedMasterKey,
        oldPassword,
        new Uint8Array(vault.passphraseSalt),
        vault.argon2,
      );
    } catch {
      throw new Error("Current password does not open your ledger.");
    }
    await relinkVaultPasscode(client, vault, masterKey, newPassword);
  }

  try {
    await client.action(api.passwordSetup.changePassword, {
      oldPassword,
      newPassword,
    });
  } catch (error) {
    if (vault && masterKey) {
      try {
        await relinkVaultPasscode(client, vault, masterKey, oldPassword);
      } catch {
        throw new Error(
          "Sign-in was not changed. If the ledger will not open, try the new password once.",
        );
      }
    }
    throw new Error(passwordError(error));
  }

  if (vault && masterKey) {
    await commitVaultUnlock(vault.vaultId, masterKey);
  }
}
