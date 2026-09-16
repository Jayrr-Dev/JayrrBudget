"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
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
  encryptLoanDocumentToVault,
  linkEncryptedLoanDocument,
} from "@/domains/loans/application/encryptLoanDocument";
import { loanFieldsToFormFill } from "@/domains/loans/domain/loanDocumentFields";
import { formatLoanDocumentProgress } from "@/domains/loans/domain/loanDocumentProgress";
import {
  LOAN_TYPES,
  RATE_TYPES,
  loanTypeMeta,
  type LoanType,
  type RateType,
} from "@/domains/loans/domain/loanTypes";
import {
  PAYMENT_FREQUENCIES,
  type PaymentFrequency,
} from "@/domains/loans/domain/paymentFrequency";
import {
  isLoanUploadAbortError,
  uploadLoanDocument,
} from "@/domains/loans/queries/uploadLoanDocument";
import { isOcrDocumentFile } from "@/domains/statements/domain/ocrDocumentTypes";
import { OcrDocumentPickerButton } from "@/domains/statements/ui/OcrDocumentPickerButton";
import { useOcrMode } from "@/domains/statements/ui/useOcrMode";
import {
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import {
  loadPrivateLedger,
  type VaultListClient,
} from "@/domains/vault/application/loadPrivateLedger";
import {
  saveEncryptedLoan,
  saveEncryptedRecords,
  vaultWriteReady,
} from "@/domains/vault/application/saveEncryptedLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { logMistralOcrUsage } from "@/shared/debug/aiUsageDebug";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import { useConvex, useMutation } from "convex/react";
import { Info, UploadIcon } from "lucide-react";
import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type AddLoanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const emptyForm = {
  name: "",
  loanType: "auto" as LoanType,
  rateType: "fixed" as RateType,
  vehicleLabel: "",
  principalStart: "",
  annualRatePct: "",
  paymentAmount: "",
  paymentFrequency: "biweekly" as PaymentFrequency,
  paymentCount: "",
  firstPaymentDate: "",
  matchMerchantClean: "",
};

const UPLOAD_TOAST = "loan-document-upload";

const LOAN_FORM_STEPS = [
  { id: 1, title: "Loan details" },
  { id: 2, title: "Balance and rate" },
  { id: 3, title: "Payment schedule" },
] as const;

type LoanFormStep = (typeof LOAN_FORM_STEPS)[number]["id"];

export function AddLoanDialog({ open, onOpenChange }: AddLoanDialogProps) {
  const router = useRouter();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const flags = useFeatureFlags();
  const ocrMode = useOcrMode();
  const createCustomLoan = useMutation(api.dashboard.createCustomLoan);
  const linkLoanDocument = useMutation(api.loanDocuments.linkToAccount);
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState<LoanFormStep>(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFileHash, setPendingFileHash] = useState<string | null>(null);
  const stepMeta = LOAN_FORM_STEPS[step - 1];
  const typeMeta = loanTypeMeta(form.loanType);
  const busy = saving || uploading;
  const vaultPersist = flags.encryptedLedger;

  function setField(key: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onLoanTypeChange(next: LoanType) {
    const meta = loanTypeMeta(next);
    setForm((prev) => ({
      ...prev,
      loanType: next,
      paymentFrequency: meta.defaultFrequency,
      rateType: meta.defaultRateType,
    }));
  }

  function resetFormState() {
    setForm(emptyForm);
    setStep(1);
    setPendingFileHash(null);
  }

  function resetAndClose() {
    resetFormState();
    onOpenChange(false);
  }

  function stepError(current: LoanFormStep): string | null {
    if (current === 1) {
      if (!form.name.trim()) {
        return "Name is required";
      }
      return null;
    }
    if (current === 2) {
      const principalStart = Number(form.principalStart);
      const annualRatePct = Number(form.annualRatePct);
      if (
        !Number.isFinite(principalStart) ||
        principalStart <= 0 ||
        !Number.isFinite(annualRatePct) ||
        annualRatePct < 0
      ) {
        return "Check principal and annual rate";
      }
      return null;
    }
    const paymentAmount = Number(form.paymentAmount);
    const paymentCount = Number(form.paymentCount);
    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0 ||
      !Number.isFinite(paymentCount) ||
      paymentCount < 1 ||
      !form.firstPaymentDate
    ) {
      return "Check payment amount, count, and first payment date";
    }
    return null;
  }

  async function onUploadDocument(file: File) {
    if (!isOcrDocumentFile(file)) {
      toast.error("Use a PDF or photo (PNG, JPG, WEBP, AVIF, HEIC).");
      return;
    }

    setUploading(true);
    toast.loading("Uploading document…", { id: UPLOAD_TOAST });

    try {
      const result = await uploadLoanDocument(file, {
        persistMode: vaultPersist ? "vault" : "convex",
        ocrMode,
        onProgress: (progress) => {
          toast.loading(formatLoanDocumentProgress(progress), {
            id: UPLOAD_TOAST,
            description: file.name,
          });
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
        await encryptLoanDocumentToVault({
          client: client as unknown as MutationClient,
          userId: privateLedger.userId,
          vaultId,
          keyId,
          masterKey,
          filename: result.filename,
          fileHash: result.fileHash,
          pageCount: result.pageCount,
          fields: result.fields,
          ocrMarkdown: result.ocrMarkdown,
          ledger,
        });
        privateLedger.reload();
      }

      if (ocrMode !== "local" && result.pageCount > 0) {
        logMistralOcrUsage({
          source: "loan-ocr",
          pages: result.pageCount,
          detail: result.filename ?? file.name,
        });
      }

      const fill = loanFieldsToFormFill(result.fields);
      setForm((prev) => ({
        ...prev,
        ...fill,
        name: fill.name || prev.name,
        vehicleLabel: fill.vehicleLabel || prev.vehicleLabel,
        matchMerchantClean: fill.matchMerchantClean || prev.matchMerchantClean,
      }));
      setPendingFileHash(result.fileHash);
      toast.success("Document scanned · review the fields", {
        id: UPLOAD_TOAST,
      });
    } catch (error) {
      if (isLoanUploadAbortError(error)) {
        toast.message("Upload cancelled", { id: UPLOAD_TOAST });
      } else {
        toast.error(errorMessage(error, "Could not read loan document"), {
          id: UPLOAD_TOAST,
        });
      }
    } finally {
      setUploading(false);
    }
  }

  function onPickerFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (file) void onUploadDocument(file);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const error = stepError(step);
    if (error) {
      toast.error(error);
      return;
    }
    if (step < 3) {
      setStep((step + 1) as LoanFormStep);
      return;
    }

    const principalStart = Number(form.principalStart);
    const annualRatePct = Number(form.annualRatePct);
    const paymentAmount = Number(form.paymentAmount);
    const paymentCount = Number(form.paymentCount);

    setSaving(true);
    try {
      const write = vaultWriteReady({
        encryptedLedger: privateLedger.encryptedLedger,
        userId: privateLedger.userId,
        vaultId: privateLedger.vaultId,
        keyId: privateLedger.keyId,
        client,
      });
      let accountId: string;
      if (write) {
        accountId = `loan-${crypto.randomUUID()}`;
        await saveEncryptedRecords(write, [
          {
            recordId: `account-${accountId}`,
            kind: "account_meta",
            value: {
              accountId,
              name: form.name.trim(),
              officialName: form.name.trim(),
              mask: null,
              type: "loan",
              subtype: form.loanType,
              currentBalance: principalStart,
              availableBalance: null,
              isoCurrencyCode: "CAD",
            },
            expectedRevision: null,
          },
        ]);
        await saveEncryptedLoan(write, {
          accountId,
          principal: principalStart,
          annualRate: annualRatePct / 100,
          paymentAmount,
          firstPaymentDate: form.firstPaymentDate,
          paymentCount: Math.floor(paymentCount),
          matchMerchantClean: form.matchMerchantClean.trim() || null,
          expectedRevision: null,
        });
        if (pendingFileHash) {
          const masterKey = getVaultMasterKey();
          if (masterKey) {
            const ledger = await loadPrivateLedger(
              client as unknown as VaultListClient,
              {
                userId: write.userId,
                vaultId: write.vaultId,
              },
            );
            await linkEncryptedLoanDocument({
              client: client as unknown as MutationClient,
              userId: write.userId,
              vaultId: write.vaultId,
              keyId: write.keyId,
              masterKey,
              fileHash: pendingFileHash,
              accountId,
              ledger,
            });
          }
        }
        privateLedger.reload();
      } else {
        ({ accountId } = await createCustomLoan({
          name: form.name.trim(),
          loanType: form.loanType,
          rateType: form.rateType,
          vehicleLabel: form.vehicleLabel.trim() || null,
          principalStart,
          annualRate: annualRatePct / 100,
          paymentAmount,
          paymentFrequency: form.paymentFrequency,
          paymentCount: Math.floor(paymentCount),
          firstPaymentDate: form.firstPaymentDate,
          matchMerchantClean: form.matchMerchantClean.trim() || null,
        }));
        if (pendingFileHash) {
          await linkLoanDocument({
            fileHash: pendingFileHash,
            accountId,
          });
        }
      }
      resetAndClose();
      router.push(`/accounts?account=${encodeURIComponent(accountId)}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create loan",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          if (!next) {
            resetFormState();
          }
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Register Lending Account
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                    aria-label="Register Lending Account info"
                  >
                    <Info className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" side="bottom" className="w-72">
                  <PopoverHeader>
                    <PopoverTitle>Register Lending Account</PopoverTitle>
                    <PopoverDescription>
                      Track a loan with amortization terms.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>
                        Mortgage, auto, student, personal, HELOC, or other
                      </li>
                      <li>
                        Upload a PDF or photo (or take one) to fill the form
                      </li>
                      <li>OCR stays encrypted for later viewing</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Track a mortgage, auto, student, personal, HELOC, or other loan
              with amortization terms.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{stepMeta?.title}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                Step {step} of {LOAN_FORM_STEPS.length}
              </p>
            </div>
            <div className="flex gap-1" aria-hidden="true">
              {LOAN_FORM_STEPS.map((item) => (
                <span
                  key={item.id}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    item.id <= step ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
          </div>

          {step === 1 ? (
            <div className="grid gap-4">
              <Field
                label="Loan type"
                htmlFor="loan-type"
                info={{
                  title: "Loan type",
                  body: "Sets the account subtype and the optional collateral field (vehicle, property, school, etc.).",
                }}
                action={
                  <OcrDocumentPickerButton
                    disabled={busy}
                    onFiles={onPickerFiles}
                  >
                    {uploading ? (
                      <>
                        <Spinner className="size-3.5" />
                        Scanning…
                      </>
                    ) : (
                      <>
                        <UploadIcon className="size-3.5" />
                        Upload Document
                      </>
                    )}
                  </OcrDocumentPickerButton>
                }
              >
                <NativeSelect
                  id="loan-type"
                  className="w-full"
                  value={form.loanType}
                  onChange={(e) => onLoanTypeChange(e.target.value as LoanType)}
                  disabled={busy}
                >
                  {LOAN_TYPES.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Name" htmlFor="loan-name">
                <Input
                  id="loan-name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder={typeMeta.namePlaceholder}
                  required
                  autoFocus
                  disabled={busy}
                />
              </Field>
              {typeMeta.showCollateral ? (
                <Field
                  label={typeMeta.collateralLabel}
                  htmlFor="loan-collateral"
                >
                  <Input
                    id="loan-collateral"
                    value={form.vehicleLabel}
                    onChange={(e) => setField("vehicleLabel", e.target.value)}
                    placeholder={typeMeta.collateralPlaceholder}
                    disabled={busy}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4">
              <Field
                label="Principal"
                htmlFor="loan-principal"
                info={{
                  title: "Principal",
                  body: "Starting balance this schedule is built from. Usually what you still owe, not the original loan amount.",
                }}
              >
                <Input
                  id="loan-principal"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.principalStart}
                  onChange={(e) => setField("principalStart", e.target.value)}
                  required
                  disabled={busy}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Rate type"
                  htmlFor="loan-rate-type"
                  info={{
                    title: "Rate type",
                    body: "Fixed stays at the rate you enter. Variable can change; the schedule still uses your current rate as an estimate until you update it.",
                  }}
                >
                  <NativeSelect
                    id="loan-rate-type"
                    className="w-full"
                    value={form.rateType}
                    onChange={(e) =>
                      setField("rateType", e.target.value as RateType)
                    }
                    disabled={busy}
                  >
                    {RATE_TYPES.map((option) => (
                      <NativeSelectOption
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Annual rate %" htmlFor="loan-rate">
                  <Input
                    id="loan-rate"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={form.annualRatePct}
                    onChange={(e) => setField("annualRatePct", e.target.value)}
                    placeholder="7.99"
                    required
                    disabled={busy}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Payment" htmlFor="loan-payment">
                  <Input
                    id="loan-payment"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={form.paymentAmount}
                    onChange={(e) => setField("paymentAmount", e.target.value)}
                    required
                    disabled={busy}
                  />
                </Field>
                <Field
                  label="# payments"
                  htmlFor="loan-count"
                  info={{
                    title: "Number of payments",
                    body: "Total payments left on the contract from the first payment date (not how many you have already made).",
                  }}
                >
                  <Input
                    id="loan-count"
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="1"
                    value={form.paymentCount}
                    onChange={(e) => setField("paymentCount", e.target.value)}
                    required
                    disabled={busy}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Frequency"
                  htmlFor="loan-frequency"
                  info={{
                    title: "Payment frequency",
                    body: "How often the bank pulls the payment. This sets the payment calendar and the interest period rate. Defaults change with loan type.",
                  }}
                >
                  <NativeSelect
                    id="loan-frequency"
                    className="w-full"
                    value={form.paymentFrequency}
                    onChange={(e) =>
                      setField(
                        "paymentFrequency",
                        e.target.value as PaymentFrequency,
                      )
                    }
                    disabled={busy}
                  >
                    {PAYMENT_FREQUENCIES.map((option) => (
                      <NativeSelectOption
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="First payment" htmlFor="loan-first">
                  <Input
                    id="loan-first"
                    type="date"
                    value={form.firstPaymentDate}
                    onChange={(e) =>
                      setField("firstPaymentDate", e.target.value)
                    }
                    required
                    disabled={busy}
                  />
                </Field>
              </div>
              <Field
                label="PAD merchant (optional)"
                htmlFor="loan-merchant"
                info={{
                  title: "PAD merchant",
                  body: "Name on the auto-debit (PAD) in your chequing account. We use it to match real payments to this loan. Leave blank to use the loan name.",
                }}
              >
                <Input
                  id="loan-merchant"
                  value={form.matchMerchantClean}
                  onChange={(e) =>
                    setField("matchMerchantClean", e.target.value)
                  }
                  placeholder="Defaults to name"
                  disabled={busy}
                />
              </Field>
            </div>
          ) : null}

          <DialogFooter>
            {step === 1 ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => resetAndClose()}
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setStep((step - 1) as LoanFormStep)}
              >
                Back
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              {step < 3 ? "Next" : saving ? "Saving…" : "Create Loan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  info,
  action,
  children,
}: {
  label: string;
  htmlFor: string;
  info?: { title: string; body: string };
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        {info ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                aria-label={`${info.title} info`}
              >
                <Info className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              <PopoverHeader>
                <PopoverTitle>{info.title}</PopoverTitle>
                <PopoverDescription>{info.body}</PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        ) : null}
        {action ? <div className="ml-auto shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}
