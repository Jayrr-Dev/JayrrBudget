export type VaultMode = "STRICT_PRIVATE" | "CLOUD_PROCESSING";
export type EnvelopeKind =
  | "document"
  | "tx_batch"
  | "tx"
  | "account_meta"
  | "category"
  | "note";

export type EncryptedEnvelopeV1 = {
  v: 1;
  alg: "AES-256-GCM";
  keyId: string;
  kind: EnvelopeKind;
  recordId: string;
  iv: ArrayBuffer;
  wrappedDek: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

export type Argon2Params = {
  algorithm: "argon2id";
  version: number;
  timeCost: number;
  memoryCost: number;
  parallelism: number;
  hashLength: number;
};

export type RecoveryFileV1 = {
  v: 1;
  type: "jayrr-budget-recovery";
  vaultId: string;
  recoverySecret: string;
  createdAt: string;
};
