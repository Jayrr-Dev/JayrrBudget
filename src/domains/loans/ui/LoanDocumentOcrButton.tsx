"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { OcrMarkdownView } from "@/domains/statements/ui/OcrMarkdownView";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";

type Props = {
  accountId: string;
};

/** View OCR for a loan contract PDF saved during Add loan → Upload Document. */
export function LoanDocumentOcrButton({ accountId }: Props) {
  const [open, setOpen] = useState(false);
  const privateLedger = usePrivateLedger();
  const vaultDoc = privateLedger.encryptedLedger
    ? privateLedger.ledger.loanDocuments
        .filter((doc) => doc.accountId === accountId && doc.ocrMarkdown?.trim())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    : null;
  const convexDoc = useQuery(
    api.loanDocuments.getByAccountId,
    privateLedger.encryptedLedger ? "skip" : { accountId },
  );

  const filename = vaultDoc?.filename ?? convexDoc?.filename ?? "Loan document";
  const markdown = vaultDoc?.ocrMarkdown ?? convexDoc?.ocrMarkdown ?? "";
  const hasOcr = Boolean(markdown.trim()) || Boolean(convexDoc?.hasOcr);

  if (!hasOcr && !vaultDoc && convexDoc === undefined) return null;
  if (!hasOcr) return null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        View OCR
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {filename}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="About OCR"
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
                    <PopoverTitle>Encrypted loan scan</PopoverTitle>
                    <PopoverDescription className="leading-relaxed">
                      This scan is encrypted with your other financial data. Only
                      you can read it.
                    </PopoverDescription>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Private OCR scan from the uploaded loan document.
            </DialogDescription>
          </DialogHeader>
          {markdown.trim() ? (
            <OcrMarkdownView markdown={markdown} />
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No scan text available.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
