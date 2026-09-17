"use client";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  resolveOcrMode,
  type OcrMode,
} from "@/domains/statements/domain/ocrMode";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";

type Props = {
  ocrMode: OcrMode;
};

export function ProfileOcrModeCard({ ocrMode }: Props) {
  const updateOcrMode = useMutation(api.users.updateOcrMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    const ocrMode = resolveOcrMode(next);
    setError(null);
    setPending(true);
    try {
      await updateOcrMode({ ocrMode });
    } catch (err: unknown) {
      setError(errorMessage(err, "Could not save scan setting."));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-6">
      <h2 className="type-section flex items-center gap-2">
        Document scan
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:bg-accent-subtle hover:text-accent"
              aria-label="About document scan"
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
              <PopoverTitle>Document scan</PopoverTitle>
              <PopoverDescription>
                How statement and loan PDFs or photos are read on this account.
              </PopoverDescription>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Local runs on this device with Tesseract</li>
                <li>Server is faster and more accurate, and sends the file</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>
      <p className="sr-only">
        Choose Local to scan on this device, or Server for a faster, more
        accurate scan that sends the document to the server.
      </p>

      <FieldSet disabled={pending} className="gap-3">
        <RadioGroup
          value={ocrMode}
          onValueChange={onChange}
          className="grid gap-3"
        >
          <FieldLabel className="w-full">
            <Field
              orientation="horizontal"
              className="w-full rounded-lg border border-border p-3"
            >
              <RadioGroupItem value="server" />
              <FieldContent>
                <FieldTitle>Server</FieldTitle>
                <FieldDescription>
                  Faster and more accurate. The document is sent to the server
                  for scanning.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
          <FieldLabel className="w-full">
            <Field
              orientation="horizontal"
              className="w-full rounded-lg border border-border p-3"
            >
              <RadioGroupItem value="local" />
              <FieldContent>
                <FieldTitle>Local</FieldTitle>
                <FieldDescription>
                  Runs on this device. Slower, and photos or messy scans may
                  miss more, but it&apos;s more private.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        </RadioGroup>
      </FieldSet>

      {error ? (
        <p
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
