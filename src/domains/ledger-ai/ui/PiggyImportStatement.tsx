"use client";

import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import { fileFromChatPart } from "@/domains/ledger-ai/application/fileFromChatPart";
import { importStatementFromChat } from "@/domains/ledger-ai/application/importStatementFromChat";
import type {
  ImportStatementDocumentInput,
  ImportStatementDocumentOutput,
} from "@/domains/ledger-ai/domain/importStatementDocumentTool";
import type { PiggyUIMessage } from "@/domains/ledger-ai/domain/piggyUiMessage";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import { useConvex } from "convex/react";
import { useEffect, useRef } from "react";

function fileForDocumentIndex(
  messages: PiggyUIMessage[],
  documentIndex: number,
) {
  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const files = (lastUser?.parts ?? []).filter((part) => part.type === "file");
  const part = files[documentIndex - 1];
  if (!part || part.type !== "file") return null;
  return fileFromChatPart(part);
}

/** Uploads the attached statement in the browser, then tells Piggy the result. */
export function PiggyImportStatement({
  input,
  pending,
  messages,
  onDone,
}: {
  input: ImportStatementDocumentInput;
  pending: boolean;
  messages: PiggyUIMessage[];
  onDone: (output: ImportStatementDocumentOutput) => void;
}) {
  const privateLedger = usePrivateLedger();
  const convex = useConvex();
  const encryptedLedger = useFeatureFlag("encryptedLedger");
  const cloudProcessing = useFeatureFlag("cloudProcessing");
  const reported = useRef(!pending);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reload = privateLedger.reload;
  const loading = privateLedger.loading;
  const unlocked = privateLedger.unlocked;
  const userId = privateLedger.userId;
  const vaultId = privateLedger.vaultId;
  const keyId = privateLedger.keyId;
  const ledger = privateLedger.ledger;

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;

  useEffect(() => {
    if (!pending || reported.current) return;
    if (encryptedLedger) {
      if (loading || !unlocked) return;
    }

    const file = fileForDocumentIndex(messagesRef.current, input.documentIndex);
    if (!file) {
      reported.current = true;
      onDoneRef.current({
        ok: false,
        error:
          "That file is no longer in this chat. Attach the statement again, then ask me to import it.",
      });
      return;
    }

    reported.current = true;
    void importStatementFromChat({
      file,
      persistMode: encryptedLedger ? "vault" : "convex",
      cloudProcessing,
      convex,
      userId,
      vaultId,
      keyId,
      ledger: ledgerRef.current,
    })
      .then((output) => {
        if (output.ok) {
          if (encryptedLedger) reload();
        }
        onDoneRef.current(output);
      })
      .catch((error: unknown) => {
        onDoneRef.current({
          ok: false,
          error: errorMessage(error, "Could not import the statement"),
        });
      });
  }, [
    cloudProcessing,
    convex,
    encryptedLedger,
    input.documentIndex,
    keyId,
    loading,
    pending,
    reload,
    unlocked,
    userId,
    vaultId,
  ]);

  if (!pending) return null;
  return (
    <p role="status" className="py-2 text-xs text-muted-foreground">
      Importing the statement…
    </p>
  );
}
