import { base64ToBytes, bytesToBase64 } from "./bytes";
import { unwrapMasterKey } from "./masterKey";
import type { RecoveryFileV1, Argon2Params } from "./types";

export function createRecoveryFile(vaultId: string, recoverySecret: Uint8Array): RecoveryFileV1 {
  return { v: 1, type: "jayrr-budget-recovery", vaultId, recoverySecret: bytesToBase64(recoverySecret), createdAt: new Date().toISOString() };
}

export function downloadRecoveryFile(file: RecoveryFileV1) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jayrr-budget-recovery-${file.vaultId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function unwrapWithRecoveryFile(file: RecoveryFileV1, wrapped: ArrayBuffer, salt: Uint8Array, argon2: Argon2Params) {
  if (file.v !== 1 || file.type !== "jayrr-budget-recovery") throw new Error("Invalid recovery file");
  return unwrapMasterKey(wrapped, base64ToBytes(file.recoverySecret), salt, argon2);
}
