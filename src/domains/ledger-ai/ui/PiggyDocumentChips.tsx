"use client";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { formatDocumentBytes } from "@/domains/ledger-ai/domain/piggyDocuments";
import { FileTextIcon, ImageIcon, XIcon } from "lucide-react";

export type PiggyDocumentChip = {
  filename: string;
  mediaType: string;
  bytes?: number;
};

function MediaIcon({ mediaType }: { mediaType: string }) {
  return mediaType.startsWith("image/") ? <ImageIcon /> : <FileTextIcon />;
}

/** Files waiting in the composer, each removable. */
export function PiggyPendingDocuments({
  files,
  onRemove,
  disabled,
}: {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  if (files.length === 0) return null;
  return (
    <AttachmentGroup className="px-3 pt-2">
      {files.map((file, index) => (
        <Attachment key={`${file.name}-${file.size}`} size="xs" state="idle">
          <AttachmentMedia>
            <MediaIcon mediaType={file.type} />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{file.name}</AttachmentTitle>
            <AttachmentDescription>{formatDocumentBytes(file.size)}</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction
              aria-label={`Remove ${file.name}`}
              disabled={disabled}
              onClick={() => onRemove(index)}
            >
              <XIcon />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}

/** Read-only chips under a sent user message. */
export function PiggySentDocuments({ files }: { files: PiggyDocumentChip[] }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {files.map((file, index) => (
        <Attachment key={`${file.filename}-${index}`} size="xs">
          <AttachmentMedia>
            <MediaIcon mediaType={file.mediaType} />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{file.filename}</AttachmentTitle>
            {file.bytes ? (
              <AttachmentDescription>{formatDocumentBytes(file.bytes)}</AttachmentDescription>
            ) : null}
          </AttachmentContent>
        </Attachment>
      ))}
    </div>
  );
}
