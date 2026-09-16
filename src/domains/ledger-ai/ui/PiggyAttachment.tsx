"use client";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import {
  buildExportFile,
  downloadBlob,
} from "@/domains/ledger-ai/application/buildExportFile";
import {
  exportFilename,
  type ExportFileInput,
  type ExportFileOutput,
} from "@/domains/ledger-ai/domain/exportFileTool";
import { errorMessage } from "@/shared/lib/error-message";
import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type BuildState =
  | { status: "building" }
  | { status: "done"; blob: Blob }
  | { status: "error"; message: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * File card for one `export_file` call. Builds the file in the browser,
 * reports back to the model once (only while the call is still pending),
 * and lets the user download it any time, including after a reload.
 */
export function PiggyAttachment({
  input,
  pending,
  onBuilt,
}: {
  input: ExportFileInput;
  /** True while the tool call has no output yet. */
  pending: boolean;
  onBuilt: (output: ExportFileOutput) => void;
}) {
  const [state, setState] = useState<BuildState>({ status: "building" });
  const reported = useRef(!pending);
  const filename = exportFilename(input);

  useEffect(() => {
    let cancelled = false;
    const report = (output: ExportFileOutput) => {
      if (reported.current) return;
      reported.current = true;
      onBuilt(output);
    };
    buildExportFile(input)
      .then((blob) => {
        if (cancelled) return;
        setState({ status: "done", blob });
        report({
          ok: true,
          filename,
          format: input.format,
          rows: input.rows.length,
          bytes: blob.size,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = errorMessage(error, "Could not build the file");
        setState({ status: "error", message });
        report({
          ok: false,
          filename,
          format: input.format,
          rows: input.rows.length,
          bytes: 0,
          error: message,
        });
      });
    return () => {
      cancelled = true;
    };
    // Build once per tool call; input is immutable for a given toolCallId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Icon = input.format === "csv" ? FileSpreadsheetIcon : FileTextIcon;
  const rows = `${input.rows.length} row${input.rows.length === 1 ? "" : "s"}`;
  const description =
    state.status === "building"
      ? "Building file…"
      : state.status === "error"
        ? state.message
        : `${input.format.toUpperCase()} · ${formatBytes(state.blob.size)} · ${rows}`;
  const download = () => {
    if (state.status === "done") downloadBlob(state.blob, filename);
  };

  return (
    <Attachment
      size="sm"
      state={
        state.status === "building"
          ? "processing"
          : state.status === "error"
            ? "error"
            : "done"
      }
      className="w-full"
    >
      <AttachmentMedia>
        <Icon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{filename}</AttachmentTitle>
        <AttachmentDescription>{description}</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          aria-label={`Download ${filename}`}
          disabled={state.status !== "done"}
          onClick={download}
        >
          <DownloadIcon />
        </AttachmentAction>
      </AttachmentActions>
      {state.status === "done" ? (
        <AttachmentTrigger
          aria-label={`Download ${filename}`}
          onClick={download}
        />
      ) : null}
    </Attachment>
  );
}
