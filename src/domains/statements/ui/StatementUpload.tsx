"use client";

import { useMutation } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { describeImportResult } from "@/domains/statements/domain/importCopy";
import { uploadBankStatement } from "@/domains/statements/queries/uploadBankStatement";
import { errorMessage } from "@/shared/lib/error-message";

const UPLOAD_TOAST = "statement-upload";

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

type Props = {
  onImported?: () => void | Promise<void>;
};

export function StatementUpload({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: uploadBankStatement,
    onMutate: () => {
      toast.loading("Reading PDF… OCR and parse can take a minute.", {
        id: UPLOAD_TOAST,
      });
    },
    onSuccess: async (data) => {
      const copy = describeImportResult(data);
      toast[copy.tone](copy.title, {
        id: UPLOAD_TOAST,
        description: copy.description,
        duration: copy.tone === "warning" ? 10_000 : 7_000,
      });
      await onImported?.();
    },
    onError: (error) => {
      toast.error("Statement import failed", {
        id: UPLOAD_TOAST,
        description: errorMessage(error, "Upload failed"),
      });
    },
  });

  return (
    <div className="flex flex-col items-start gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (!isPdfFile(file)) {
            toast.error("Need a PDF", {
              description: "Bank statements upload as PDF only.",
            });
            return;
          }
          upload.mutate(file);
        }}
      />
      <ButtonGroup>
        <Button
          type="button"
          variant="outline"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? "OCR + parsing…" : "Upload statement PDF"}
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
                Mistral OCR → Gemini parse → ledger. One row per statement
                line (post date + trans date). Opening + transactions must
                equal closing; statement totals are stored on the upload.
              </PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </ButtonGroup>
    </div>
  );
}
