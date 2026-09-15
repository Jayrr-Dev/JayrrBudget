"use client";

import { useQuery } from "convex/react";
import {
  CheckIcon,
  CopyCheckIcon,
  FileTextIcon,
  FileWarningIcon,
  Info,
  ListChecks,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
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
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
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
import { uploadBankStatement, isUploadAbortError } from "@/domains/statements/queries/uploadBankStatement";
import { StatementAiRulesDialog } from "@/domains/statements/ui/StatementAiRulesDialog";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/shared/lib/error-message";

const UPLOAD_TOAST = "statement-upload";
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

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
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
        : "Already imported · same PDF bytes",
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
  const inputRef = useRef<HTMLInputElement>(null);
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

  busyRef.current = busy;
  itemsRef.current = items;

  const fingerprints = useQuery(
    api.statements.listCompletedFingerprints,
    dialogOpen ? {} : "skip",
  );
  fingerprintsRef.current = fingerprints;

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
          hint = "Duplicate in this queue · same PDF bytes";
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
      if (!isPdfFile(file)) {
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
    if (skippedType) notes.push(`${skippedType} not PDF`);
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
    if (inputRef.current) inputRef.current.value = "";
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
          onProgress: (progress) => {
            const state: ItemState =
              progress.step === "parse" || progress.step === "save"
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

        const copy = describeImportResult(result);
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
      toast.warning(
        `${okCount} imported · ${warningCount} with balance warnings`,
        { id: UPLOAD_TOAST },
      );
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
    (item) =>
      item.duplicateKind === "exact" || item.duplicateKind === "queue",
  ).length;
  const checkingCount = items.filter(
    (item) => item.dupCheck === "pending" && item.state === "idle",
  ).length;

  const triggerLabel = busy
    ? "Uploading…"
    : "Upload statement PDF";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonGroup>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setDialogOpen(true)}
          >
            {triggerLabel}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="How statement upload works"
              >
                <Info />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <PopoverHeader>
                <PopoverTitle>Manual import path</PopoverTitle>
                <PopoverDescription>
                  Opens a picker for up to 24 PDFs. Duplicates are marked in the
                  list before OCR. Your upload rules apply only to your own
                  statements.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </ButtonGroup>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setRulesOpen(true)}
        >
          <ListChecks data-icon="inline-start" />
          Upload Rules
        </Button>
      </div>

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
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Upload statements</DialogTitle>
            <DialogDescription>
              Drag PDFs here or choose files. Up to {MAX_FILES} · 20MB each.
              Already-imported files are marked before scan.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <div className="space-y-3">
            <div
              role="button"
              tabIndex={busy ? -1 : 0}
              aria-disabled={busy}
              aria-label="Choose PDF statement files"
              onClick={() => {
                if (!busy) inputRef.current?.click();
              }}
              onKeyDown={(event) => {
                if (busy) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  inputRef.current?.click();
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
                Drag & Drop or Choose file to upload
              </span>
              <span className="text-xs text-muted-foreground">
                Up to {MAX_FILES} PDFs · 20MB each
              </span>
            </div>

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
                                      : `PDF · ${formatFileSize(item.file.size)}`}
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

          <DialogFooter>
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
