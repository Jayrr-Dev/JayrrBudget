"use client";

import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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

export function AddLoanDialog({ open, onOpenChange }: AddLoanDialogProps) {
  const router = useRouter();
  const createCustomLoan = useMutation(api.dashboard.createCustomLoan);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const typeMeta = loanTypeMeta(form.loanType);

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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const principalStart = Number(form.principalStart);
    const annualRatePct = Number(form.annualRatePct);
    const paymentAmount = Number(form.paymentAmount);
    const paymentCount = Number(form.paymentCount);

    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (
      !Number.isFinite(principalStart) ||
      principalStart <= 0 ||
      !Number.isFinite(annualRatePct) ||
      annualRatePct < 0 ||
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0 ||
      !Number.isFinite(paymentCount) ||
      paymentCount < 1 ||
      !form.firstPaymentDate
    ) {
      toast.error("Check loan terms numbers and dates");
      return;
    }

    setSaving(true);
    try {
      const { accountId } = await createCustomLoan({
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
      });
      setForm(emptyForm);
      onOpenChange(false);
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
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add loan</DialogTitle>
            <DialogDescription>
              Track a mortgage, auto, student, personal, HELOC, or other loan
              with amortization terms.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Field
              label="Loan type"
              htmlFor="loan-type"
              info={{
                title: "Loan type",
                body: "Sets the account subtype and the optional collateral field (vehicle, property, school, etc.).",
              }}
            >
              <NativeSelect
                id="loan-type"
                className="w-full"
                value={form.loanType}
                onChange={(e) => onLoanTypeChange(e.target.value as LoanType)}
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
                />
              </Field>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
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
                />
              </Field>
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
                >
                  {RATE_TYPES.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
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
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
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
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                >
                  {PAYMENT_FREQUENCIES.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
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
                  onChange={(e) => setField("firstPaymentDate", e.target.value)}
                  required
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
                onChange={(e) => setField("matchMerchantClean", e.target.value)}
                placeholder="Defaults to name"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Add loan"}
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
  children,
}: {
  label: string;
  htmlFor: string;
  info?: { title: string; body: string };
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
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
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
      </div>
      {children}
    </div>
  );
}
