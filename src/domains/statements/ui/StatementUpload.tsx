"use client";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import { useFeatureFlags } from "@/domains/feature-flags/ui/useFeatureFlag";
import {
  normalizeStatementFilename,
  sha256FileHex,
} from "@/domains/statements/domain/fileFingerprint";
import { describeImportResult } from "@/domains/statements/domain/importCopy";
import {
  formatImportProgress,
  STATEMENT_IMPORT_STEPS,
  type StatementImportProgress,
} from "@/domains/statements/domain/importProgress";
import { isOcrDocumentFile } from "@/domains/statements/domain/ocrDocumentTypes";
import {
  isUploadAbortError,
  uploadBankStatement,
} from "@/domains/statements/queries/uploadBankStatement";
import {
  OCR_UPLOAD_HINT_POINTER,
  OCR_UPLOAD_HINT_TOUCH,
  useOcrDocumentInputs,
} from "@/domains/statements/ui/OcrDocumentPickerButton";
import { StatementAiRulesDialog } from "@/domains/statements/ui/StatementAiRulesDialog";
import { useOcrMode } from "@/domains/statements/ui/useOcrMode";
import { encryptStatementImportToVault } from "@/domains/vault/application/encryptStatementImport";
import {
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import {
  loadPrivateLedger,
  type VaultListClient,
} from "@/domains/vault/application/loadPrivateLedger";
import { ImportLedgerCsv } from "@/domains/vault/ui/ImportLedgerCsv";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  CameraIcon,
  CheckIcon,
  CopyCheckIcon,
  EllipsisIcon,
  FileTextIcon,
  FileUpIcon,
  FileWarningIcon,
  Info,
  ListChecks,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const UPLOAD_TOAST = "statement-upload";
const MERCHANT_BACKFILL_KEY = "jayrr-budget.merchant-backfill-v1";
const MAX_FILES = 24;
const MAX_BYTES = 20 * 1024 * 1024;

type ItemState = "idle" | "uploading" | "processing" | "error" | "done";
type DupKind = "exact" | "filename" | "queue" | null;
type DupCheck = "pending" | "ready";

type QueueItem = {
  id: string;
  file: File;
  state: ItemState;
  progress: StatementImportProgress | null;
  error: string | null;
  fileHash: string | null;
  dupCheck: DupCheck;
  duplicateKind: DupKind;
  duplicateHint: string | null;
};

type Fingerprint = {
  fileHash: string;
  filename: string;
  pageCount: number | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
};

type Props = {
  onImported?: () => void | Promise<void>;
};

function isStatementUploadFile(file: File) {
  return isOcrDocumentFile(file);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function newItemId() {
  return `pdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function periodLabel(fp: Fingerprint) {
  if (fp.statementPeriodStart && fp.statementPeriodEnd) {
    return `${fp.statementPeriodStart} → ${fp.statementPeriodEnd}`;
  }
  if (fp.pageCount != null) return `${fp.pageCount} pages`;
  return null;
}

function classifyAgainstKnown(
  hash: string,
  filename: string,
  fingerprints: Fingerprint[],
): { kind: DupKind; hint: string | null } {
  const byHash = fingerprints.find((fp) => fp.fileHash === hash);
  if (byHash) {
    const period = periodLabel(byHash);
    return {
      kind: "exact",
      hint: period
        ? `Already imported · ${period}`
        : "Already imported · same file bytes",
    };
  }
  const name = normalizeStatementFilename(filename);
  const byName = fingerprints.find(
    (fp) => normalizeStatementFilename(fp.filename) === name,
  );
  if (byName) {
    const period = periodLabel(byName);
    return {
      kind: "filename",
      hint: period
        ? `Same filename as prior import (${period}). Verify.`
        : "Same filename as prior import. Verify.",
    };
  }
  return { kind: null, hint: null };
}

export function StatementUpload({ onImported }: Props) {
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  const fingerprintsRef = useRef<Fingerprint[] | undefined>(undefined);
  const hashingIdsRef = useRef(new Set<string>());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const client = useConvex();
  const flags = useFeatureFlags();
  const ocrMode = useOcrMode();
  const privateLedger = usePrivateLedger();
  const vaultPersist = flags.encryptedLedger;

  busyRef.current = busy;
  itemsRef.current = items;

  const ocrPicker = useOcrDocumentInputs({
    multiple: true,
    disabled: busy,
    onFiles: (files) => addFiles(files),
  });

  const fingerprints = useQuery(
    api.statements.listCompletedFingerprints,
    dialogOpen && !vaultPersist ? {} : "skip",
  );
  const backfillMerchants = useMutation(api.merchants.backfillFromTransactions);
  const vaultFingerprints: Fingerprint[] = privateLedger.ledger.statementLogs
    .filter((log) => log.fileHash)
    .map((log) => ({
      fileHash: log.fileHash,
      filename: log.filename,
      pageCount: log.pageCount,
      statementPeriodStart: log.statementPeriodStart,
      statementPeriodEnd: log.statementPeriodEnd,
    }));
  fingerprintsRef.current = vaultPersist ? vaultFingerprints : fingerprints;

  useEffect(() => {
    if (dialogOpen) return;
    if (busyRef.current) return;
    setItems([]);
    setDragOver(false);
    hashingIdsRef.current.clear();
  }, [dialogOpen]);

  async function scanDuplicates(batch: QueueItem[]) {
    const known = fingerprintsRef.current;
    if (known === undefined || batch.length === 0) return;

    let exactCount = 0;
    let nameCount = 0;
    const seenHashes = new Set(
      itemsRef.current
        .filter((item) => item.fileHash && item.dupCheck === "ready")
        .map((item) => item.fileHash as string),
    );

    for (const item of batch) {
      if (hashingIdsRef.current.has(item.id)) continue;
      hashingIdsRef.current.add(item.id);
      try {
        const hash = await sha256FileHex(item.file);
        // Dropped from queue while hashing.
        if (!itemsRef.current.some((row) => row.id === item.id)) continue;

        let { kind, hint } = classifyAgainstKnown(hash, item.file.name, known);
        if (!kind && seenHashes.has(hash)) {
          kind = "queue";
          hint = "Duplicate in this queue · same file bytes";
        }
        seenHashes.add(hash);
        if (kind === "exact" || kind === "queue") exactCount += 1;
        else if (kind === "filename") nameCount += 1;

        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  fileHash: hash,
                  dupCheck: "ready" as const,
                  duplicateKind: kind,
                  duplicateHint: hint,
                }
              : row,
          ),
        );
      } catch {
        if (!itemsRef.current.some((row) => row.id === item.id)) continue;
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  dupCheck: "ready" as const,
                  duplicateKind: null,
                  duplicateHint: null,
                }
              : row,
          ),
        );
      } finally {
        hashingIdsRef.current.delete(item.id);
      }
    }

    if (exactCount > 0 || nameCount > 0) {
      const bits: string[] = [];
      if (exactCount) bits.push(`${exactCount} already imported`);
      if (nameCount) bits.push(`${nameCount} same filename`);
      toast.message("Duplicates marked", { description: bits.join(" · ") });
    }
  }

  // Fingerprints arrive after files may already sit in the queue.
  useEffect(() => {
    if (!dialogOpen || fingerprints === undefined) return;
    const pending = itemsRef.current.filter(
      (item) => item.dupCheck === "pending" && item.state === "idle",
    );
    if (pending.length === 0) return;
    void scanDuplicates(pending);
  }, [dialogOpen, fingerprints]);

  function setBusySafe(next: boolean) {
    busyRef.current = next;
    setBusy(next);
  }

  function patchItem(id: string, patch: Partial<QueueItem>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function addFiles(list: FileList | File[] | null | undefined) {
    if (!list || busyRef.current) return;
    const incoming = Array.from(list);
    const existingKeys = new Set(items.map((item) => fileKey(item.file)));
    const next: QueueItem[] = [];
    let skippedType = 0;
    let skippedSize = 0;
    let skippedDup = 0;
    let skippedCap = 0;

    for (const file of incoming) {
      if (items.length + next.length >= MAX_FILES) {
        skippedCap += 1;
        continue;
      }
      if (!isStatementUploadFile(file)) {
        skippedType += 1;
        continue;
      }
      if (file.size > MAX_BYTES) {
        skippedSize += 1;
        continue;
      }
      const key = fileKey(file);
      if (existingKeys.has(key)) {
        skippedDup += 1;
        continue;
      }
      existingKeys.add(key);
      next.push({
        id: newItemId(),
        file,
        state: "idle",
        progress: null,
        error: null,
        fileHash: null,
        dupCheck: "pending",
        duplicateKind: null,
        duplicateHint: null,
      });
    }

    if (next.length > 0) {
      setItems((prev) => [...prev, ...next]);
      void scanDuplicates(next);
    }

    const notes: string[] = [];
    if (skippedType) notes.push(`${skippedType} not PDF/image`);
    if (skippedSize) notes.push(`${skippedSize} over 20MB`);
    if (skippedDup) notes.push(`${skippedDup} already queued`);
    if (skippedCap) notes.push(`cap ${MAX_FILES} files`);
    if (notes.length > 0) {
      toast.message("Some files skipped", { description: notes.join(" · ") });
    }
  }

  function removeItem(id: string) {
    if (busyRef.current) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function clearQueue() {
    setItems([]);
    hashingIdsRef.current.clear();
  }

  function cancelUpload() {
    abortRef.current?.abort();
  }

  function closeDialog() {
    if (busyRef.current) {
      cancelUpload();
    }
    setDialogOpen(false);
  }

  function onCancelClick() {
    if (busyRef.current) {
      cancelUpload();
      return;
    }
    clearQueue();
    setDialogOpen(false);
  }

  async function startUpload() {
    const pending = items.filter(
      (item) =>
        (item.state === "idle" || item.state === "error") &&
        item.duplicateKind !== "exact" &&
        item.duplicateKind !== "queue",
    );
    if (pending.length === 0 || busyRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusySafe(true);
    let okCount = 0;
    let failCount = 0;
    let warningCount = 0;
    let cancelled = false;

    toast.loading(`Uploading 0/${pending.length}…`, { id: UPLOAD_TOAST });

    for (let index = 0; index < pending.length; index += 1) {
      if (controller.signal.aborted) {
        cancelled = true;
        break;
      }

      const item = pending[index]!;
      patchItem(item.id, {
        state: "uploading",
        progress: { step: "receive", ...STATEMENT_IMPORT_STEPS.receive },
        error: null,
      });

      toast.loading(`Uploading ${index + 1}/${pending.length}…`, {
        id: UPLOAD_TOAST,
        description: item.file.name,
      });

      try {
        const result = await uploadBankStatement(item.file, {
          signal: controller.signal,
          persistMode: vaultPersist ? "vault" : "convex",
          ocrMode,
          onProgress: (progress) => {
            const state: ItemState =
              progress.step === "parse" ||
              progress.step === "save" ||
              progress.step === "categorize"
                ? "processing"
                : "uploading";
            patchItem(item.id, { state, progress });
            toast.loading(
              `Uploading ${index + 1}/${pending.length} · ${formatImportProgress(progress)}`,
              {
                id: UPLOAD_TOAST,
                description: item.file.name,
              },
            );
          },
        });

        if (vaultPersist) {
          if (!flags.cloudProcessing) {
            throw new Error(
              "Turn on Cloud Processing in Modules before uploading a document.",
            );
          }
          const opened = await hydrateVaultSession(
            client as unknown as VaultClient,
          );
          const masterKey = getVaultMasterKey();
          const vaultId = privateLedger.vaultId ?? opened?.vaultId ?? null;
          const keyId = privateLedger.keyId ?? opened?.keyId ?? null;
          if (!privateLedger.userId || !vaultId || !keyId || !masterKey) {
            throw new Error("Sign in again, then retry the upload.");
          }
          const ledger = await loadPrivateLedger(
            client as unknown as VaultListClient,
            {
              userId: privateLedger.userId,
              vaultId,
            },
          );
          await encryptStatementImportToVault({
            client: client as unknown as MutationClient,
            userId: privateLedger.userId,
            vaultId,
            keyId,
            masterKey,
            result,
            ledger,
          });
          privateLedger.reload();
        }

        const copy = describeImportResult(result);
        if (result.categorization?.ok === false) {
          toast.warning("Imported; categorization needs attention", {
            description: copy.description,
          });
        }
        if (copy.tone === "warning") warningCount += 1;
        else okCount += 1;

        patchItem(item.id, {
          state: "done",
          progress: { step: "done", ...STATEMENT_IMPORT_STEPS.done },
          error: null,
        });
      } catch (error) {
        if (isUploadAbortError(error) || controller.signal.aborted) {
          cancelled = true;
          patchItem(item.id, {
            state: "error",
            progress: null,
            error: "Cancelled",
          });
          break;
        }
        failCount += 1;
        patchItem(item.id, {
          state: "error",
          progress: null,
          error: errorMessage(error, "Upload failed"),
        });
      }
    }

    abortRef.current = null;
    setBusySafe(false);

    if (okCount > 0 && !vaultPersist) {
      try {
        localStorage.removeItem(MERCHANT_BACKFILL_KEY);
        let cursor: string | null = null;
        for (let i = 0; i < 20; i += 1) {
          const backfillResult: {
            continueCursor: string | null;
            isDone: boolean;
          } = await backfillMerchants({
            limit: 500,
            cursor,
          });
          cursor = backfillResult.continueCursor;
          localStorage.setItem(
            MERCHANT_BACKFILL_KEY,
            backfillResult.isDone
              ? "done"
              : (backfillResult.continueCursor ?? ""),
          );
          if (backfillResult.isDone) break;
        }
      } catch {
        // ledger import already succeeded
      }
    }

    await onImported?.();

    if (cancelled) {
      toast.message(
        okCount > 0
          ? `Cancelled · ${okCount} already imported`
          : "Upload cancelled",
        { id: UPLOAD_TOAST },
      );
      return;
    }

    if (failCount === 0 && warningCount === 0) {
      toast.success(
        okCount === 1 ? "Statement imported" : `${okCount} statements imported`,
        { id: UPLOAD_TOAST },
      );
      return;
    }

    if (failCount === 0) {
      toast.warning(`${okCount} imported · ${warningCount} with warnings`, {
        id: UPLOAD_TOAST,
      });
      return;
    }

    toast.error(
      `${okCount} imported · ${failCount} failed${warningCount ? ` · ${warningCount} warnings` : ""}`,
      { id: UPLOAD_TOAST },
    );
  }

  const pendingCount = items.filter(
    (item) =>
      (item.state === "idle" || item.state === "error") &&
      item.duplicateKind !== "exact" &&
      item.duplicateKind !== "queue",
  ).length;
  const dupCount = items.filter(
    (item) => item.duplicateKind === "exact" || item.duplicateKind === "queue",
  ).length;
  const checkingCount = items.filter(
    (item) => item.dupCheck === "pending" && item.state === "idle",
  ).length;

  const isMobile = useIsMobile();
  const triggerLabel = busy ? "Uploading…" : "Upload statement";

  const uploadHelp = (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
          aria-label="How statement upload works"
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.stopPropagation();
            }
          }}
        >
          <Info className="size-3.5" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-80 gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Manual import path</PopoverTitle>
          <PopoverDescription>
            Opens a picker for PDFs or photos.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Up to 24 files. Duplicates are marked before scan.</li>
            <li>Upload rules apply only to your own statements.</li>
            <li>CSV import is encrypted.</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );

  const uploadButton = (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={() => setDialogOpen(true)}
    >
      {triggerLabel}
      {uploadHelp}
    </Button>
  );

  return (
    <div className="flex flex-col items-start gap-1.5">
      {isMobile ? (
        <div className="flex items-center gap-2">
          {uploadButton}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More import options"
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={busy}
                />
              }
            >
              <EllipsisIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem
                className="p-0 focus:bg-transparent"
                onSelect={(event) => event.preventDefault()}
              >
                <ImportLedgerCsv onImported={onImported} variant="item" />
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy}
                onClick={() => setRulesOpen(true)}
              >
                <ListChecks />
                Upload Rules
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <ButtonGroup>
          <ImportLedgerCsv onImported={onImported} />
          {uploadButton}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setRulesOpen(true)}
          >
            <ListChecks data-icon="inline-start" />
            Upload Rules
          </Button>
        </ButtonGroup>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
            return;
          }
          setDialogOpen(true);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton
          onPointerDownOutside={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest('[data-slot="dropdown-menu-content"]')
            ) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest('[data-slot="dropdown-menu-content"]')
            ) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader className="gap-0 pr-8">
            <DialogTitle className="flex items-center gap-2">
              Upload statements
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                    aria-label="About statement upload"
                  >
                    <Info className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  sideOffset={8}
                  className="w-80 gap-0 p-3.5"
                >
                  <PopoverHeader className="gap-1.5">
                    <PopoverTitle>How upload works</PopoverTitle>
                    <PopoverDescription className="sr-only">
                      Drag PDFs or photos here or choose files. Up to{" "}
                      {MAX_FILES} · 20MB each. Already-imported files are marked
                      before scan.
                      {vaultPersist
                        ? " The scan is encrypted. Only you can read it."
                        : ""}
                    </PopoverDescription>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-relaxed text-muted-foreground">
                      <li>On your phone, tap to take a photo or pick a file</li>
                      <li>Up to {MAX_FILES} · 20MB each.</li>
                      <li>Already-imported files are marked before scan.</li>
                      {vaultPersist ? (
                        <li>The scan is encrypted. Only you can read it.</li>
                      ) : null}
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Drag PDFs or photos here or choose files. Up to {MAX_FILES} · 20MB
              each. Already-imported files are marked before scan.
              {vaultPersist
                ? " The scan is encrypted. Only you can read it."
                : ""}
            </DialogDescription>
          </DialogHeader>

          {ocrPicker.inputs}

          <div className="space-y-4">
            {ocrPicker.showCameraMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={busy}
                  render={
                    <div
                      role="button"
                      tabIndex={busy ? -1 : 0}
                      aria-disabled={busy}
                      aria-label="Upload statement files or take a photo"
                      onDragEnter={(event) => {
                        event.preventDefault();
                        if (!busy) setDragOver(true);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!busy) setDragOver(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        setDragOver(false);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOver(false);
                        if (busy) return;
                        addFiles(event.dataTransfer.files);
                      }}
                      className={cn(
                        "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors outline-none",
                        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        busy
                          ? "pointer-events-none opacity-60"
                          : "cursor-pointer",
                        dragOver
                          ? "border-foreground/40 bg-muted/60"
                          : "border-border bg-muted/20 hover:bg-muted/40",
                      )}
                    />
                  }
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-background text-foreground ring-1 ring-border">
                    <UploadIcon className="size-4" />
                  </span>
                  <span className="text-sm font-medium">
                    {OCR_UPLOAD_HINT_POINTER}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PDF or photo · take photo or choose file · up to {MAX_FILES}{" "}
                    · 20MB each
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  side="top"
                  sideOffset={8}
                  className="w-auto min-w-44"
                >
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => ocrPicker.openCamera()}
                  >
                    <CameraIcon className="size-4" />
                    Take photo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => ocrPicker.openFilePicker()}
                  >
                    <FileUpIcon className="size-4" />
                    Choose file
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div
                role="button"
                tabIndex={busy ? -1 : 0}
                aria-disabled={busy}
                aria-label="Choose statement files"
                onClick={() => {
                  if (!busy) ocrPicker.openFilePicker();
                }}
                onKeyDown={(event) => {
                  if (busy) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    ocrPicker.openFilePicker();
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (!busy) setDragOver(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!busy) setDragOver(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  if (busy) return;
                  addFiles(event.dataTransfer.files);
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors outline-none",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  busy ? "pointer-events-none opacity-60" : "cursor-pointer",
                  dragOver
                    ? "border-foreground/40 bg-muted/60"
                    : "border-border bg-muted/20 hover:bg-muted/40",
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-background text-foreground ring-1 ring-border">
                  <UploadIcon className="size-4" />
                </span>
                <span className="text-sm font-medium">
                  {ocrPicker.isMobile
                    ? OCR_UPLOAD_HINT_TOUCH
                    : "Drag & drop or choose file to upload"}
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF or photo · up to {MAX_FILES} · 20MB each
                </span>
              </div>
            )}

            {items.length > 0 ? (
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {items.map((item) => {
                  const isExactDup =
                    item.duplicateKind === "exact" ||
                    item.duplicateKind === "queue";
                  const isNameDup = item.duplicateKind === "filename";
                  const attachmentState: ItemState = isExactDup
                    ? "done"
                    : item.state;

                  return (
                    <li key={item.id}>
                      <Attachment
                        state={attachmentState}
                        className={cn(
                          "w-full",
                          isExactDup && "border-amber-500/40 bg-amber-500/5",
                          isNameDup &&
                            item.state === "idle" &&
                            "border-amber-500/25",
                        )}
                      >
                        <AttachmentMedia>
                          {item.dupCheck === "pending" &&
                          item.state === "idle" ? (
                            <Spinner />
                          ) : item.state === "uploading" ||
                            item.state === "processing" ? (
                            <Spinner />
                          ) : isExactDup ? (
                            <CopyCheckIcon className="text-amber-700" />
                          ) : isNameDup && item.state === "idle" ? (
                            <FileWarningIcon className="text-amber-700" />
                          ) : item.state === "error" ? (
                            <FileWarningIcon />
                          ) : item.state === "done" ? (
                            <CheckIcon />
                          ) : (
                            <FileTextIcon />
                          )}
                        </AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle>{item.file.name}</AttachmentTitle>
                          <AttachmentDescription
                            className={cn(
                              (isExactDup || isNameDup) &&
                                "text-amber-800/90 dark:text-amber-200/90",
                            )}
                          >
                            {item.dupCheck === "pending" &&
                            item.state === "idle"
                              ? "Checking for duplicates…"
                              : item.state === "uploading" ||
                                  item.state === "processing"
                                ? item.progress
                                  ? `${item.progress.percent}% · ${item.progress.label}`
                                  : "Starting…"
                                : item.state === "error"
                                  ? (item.error ?? "Upload failed")
                                  : item.state === "done"
                                    ? "Imported"
                                    : item.duplicateHint
                                      ? item.duplicateHint
                                      : `File · ${formatFileSize(item.file.size)}`}
                          </AttachmentDescription>
                        </AttachmentContent>
                        <AttachmentActions>
                          {!busy && item.state !== "done" ? (
                            <AttachmentAction
                              type="button"
                              aria-label={`Remove ${item.file.name}`}
                              onClick={() => removeItem(item.id)}
                            >
                              <XIcon />
                            </AttachmentAction>
                          ) : null}
                        </AttachmentActions>
                      </Attachment>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {dupCount > 0 || checkingCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {checkingCount > 0
                  ? `Checking ${checkingCount} file${checkingCount === 1 ? "" : "s"}…`
                  : null}
                {checkingCount > 0 && dupCount > 0 ? " · " : null}
                {dupCount > 0
                  ? `${dupCount} duplicate${dupCount === 1 ? "" : "s"} skipped on upload`
                  : null}
              </p>
            ) : null}
          </div>

          <DialogFooter className="items-center sm:justify-center">
            <Button type="button" variant="outline" onClick={onCancelClick}>
              {busy
                ? "Cancel upload"
                : items.some((item) => item.state === "done")
                  ? "Close"
                  : "Cancel"}
            </Button>
            <Button
              type="button"
              disabled={pendingCount === 0 || busy || checkingCount > 0}
              onClick={() => void startUpload()}
            >
              {busy
                ? "Uploading…"
                : checkingCount > 0
                  ? "Checking…"
                  : pendingCount > 1
                    ? `Upload ${pendingCount}`
                    : pendingCount === 1 &&
                        items.some((item) => item.state === "error")
                      ? "Retry failed"
                      : pendingCount === 1
                        ? "Upload"
                        : dupCount > 0
                          ? "All duplicates"
                          : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StatementAiRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  );
}
