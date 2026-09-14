# TODO: Client-side encrypted financial storage

**Status:** Phase 1 design approved; implementation not started.  
**Architecture (full plan):** [e2ee-architecture.md](./e2ee-architecture.md)  
**Rule:** Finish one phase (design → code → tests → manual check → security questions). Stop before the next.

## Decisions locked

- [x] Greenfield only — new encrypted tables/fields; leave existing plaintext Convex ledger alone until a later migration phase
- [x] Two modes — **STRICT PRIVATE** (default, zero-knowledge ciphertext sync) + **Cloud Processing** (opt-in; Mistral / OpenRouter / canvas AI; **not** E2EE)
- [x] Not messaging crypto — envelope encryption + AES-256-GCM (Web Crypto); no Signal / Double Ratchet
- [x] Auth ≠ encryption — login must not give Convex the decryption key

## Phase checklist

### Phase 1 — Threat model and architecture

- [ ] Write / maintain [e2ee-architecture.md](./e2ee-architecture.md) (threat model, modes, flows, metadata leakage)
- [ ] Add `src/crypto/types.ts` (+ AAD / mode contracts) — envelope types only, **no encrypt impl**
- [ ] Mode constants: `STRICT_PRIVATE` | `CLOUD_PROCESSING` + copy that Cloud mode is not E2EE
- [ ] Phase 1 security-review checklist / stop-gate before Phase 2
- [ ] Document proposed `encrypted*` Convex tables in architecture doc; **defer live schema to Phase 4**
- [ ] Do **not** ship Argon2, encrypt APIs, upload-path changes, or plaintext migration

### Phase 2 — Master key and recovery

- [ ] Client-generated User Master Key (UMK); never upload plaintext UMK
- [ ] Password → Argon2id → KEK → wrap UMK (and/or recovery key, WebAuthn)
- [ ] IndexedDB storage of wrapped key material; no keys in localStorage / cookies / URLs
- [ ] Tests: wrap/unwrap, wrong password, recovery workflow design

### Phase 3 — Encryption envelope and client crypto layer

- [ ] `src/crypto/` — masterKey, deriveKey, wrapKey, encrypt, decrypt, storage
- [ ] AES-256-GCM + AES-KW (or AES-GCM wrap); HKDF purpose separation
- [ ] AAD binds immutable ids (`v`, `userId`, `recordId`, `kind`, `keyId`)
- [ ] Tests: roundtrip, wrong key, bit-flip, AAD mismatch, unique IV

### Phase 4 — Convex encrypted schema and authorization

- [ ] Additive `encryptedDocuments` / `encryptedTxRecords` (names per architecture)
- [ ] `requireUser` + `userId` scope on all encrypted tables
- [ ] Store `v.bytes()` / file storage for large ciphertext — avoid base64
- [ ] No sensitive plaintext columns for “convenient” indexes

### Phase 5 — Local CSV / OFX / QFX parsing

- [ ] Client-only parsers under `src/financial/`
- [ ] Normalize → encrypt → Convex ciphertext only

### Phase 6 — Local PDF text extraction

- [ ] Browser PDF text extract + local parse (STRICT)
- [ ] Never send PDF to Next/Convex/AI on STRICT path

### Phase 7 — Local OCR feasibility

- [ ] Investigate Wasm/browser OCR for scanned PDFs
- [ ] If impractical: block or require explicit Cloud Processing (labeled not E2EE)
- [ ] Do not silently cloud-OCR

### Phase 8 — Encrypted original document storage

- [ ] Local encrypt file → upload ciphertext → store wrapped DEK + safe metadata
- [ ] Chunked AEAD for large files (established construction only)
- [ ] AuthZ on upload URL / download path

### Phase 9 — Encrypted structured transaction storage

- [ ] Statement-scoped DEK + per-transaction ciphertext rows
- [ ] Contract tests: mutations never carry plaintext fixture fields

### Phase 10 — Local search, sort, filter, calculate

- [ ] Decrypt in browser/Worker → in-memory indexes
- [ ] No server-side filter on merchants/amounts
- [ ] No deterministic blind indexes unless leakage documented + opt-in

### Phase 11 — Multi-device key sync

- [ ] QR / public-key device linking or encrypted recovery package
- [ ] Convex stores wrapped packages only

### Phase 12 — Encrypted backup and recovery

- [ ] Exports = ciphertext only
- [ ] Recovery requires user encryption secret (not auth alone)

### Phase 13 — Key rotation

- [ ] `keyId` / encryptionVersion on envelopes
- [ ] New data on new key; optional local background re-encrypt

### Phase 14 — Security review and adversarial testing

- [ ] Full security-review question set (see architecture doc)
- [ ] Adversarial tests: XSS assumptions, metadata leakage, Cloud mode labeling

## Later (explicitly out of phased E2EE core)

- [ ] Migrate existing plaintext ledger rows → encrypted tables (post greenfield)
- [ ] Product UI for mode selection / Cloud Processing consent

## Security-review questions (ask every phase)

1. What plaintext exists?
2. Where does it exist?
3. How long does it exist?
4. What gets sent over the network?
5. What does Convex receive / store?
6. What can a Convex administrator read?
7. What would a DB / storage leak expose?
8. What would XSS / compromised deploy expose?
9. What would a compromised user device expose?
10. What happens if the user loses their encryption key?
11. What metadata remains visible?
12. Did this phase weaken STRICT PRIVATE / claim E2EE falsely?
