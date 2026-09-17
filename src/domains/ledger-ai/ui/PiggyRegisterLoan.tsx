"use client";

import { fileFromChatPart } from "@/domains/ledger-ai/application/fileFromChatPart";
import { registerLoanFromChat } from "@/domains/ledger-ai/application/registerLoanFromChat";
import type {
  RegisterLoanFromDocumentInput,
  RegisterLoanFromDocumentOutput,
} from "@/domains/ledger-ai/domain/registerLoanFromDocumentTool";
import type { PiggyUIMessage } from "@/domains/ledger-ai/domain/piggyUiMessage";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
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

/** Registers an attached loan document in the browser vault, then tells Piggy. */
export function PiggyRegisterLoan({
  input,
  pending,
  messages,
  onDone,
}: {
  input: RegisterLoanFromDocumentInput;
  pending: boolean;
  messages: PiggyUIMessage[];
  onDone: (output: RegisterLoanFromDocumentOutput) => void;
}) {
  const privateLedger = usePrivateLedger();
  const convex = useConvex();
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
    if (loading || !unlocked) return;

    const file = fileForDocumentIndex(messagesRef.current, input.documentIndex);
    if (!file) {
      reported.current = true;
      onDoneRef.current({
        ok: false,
        error:
          "That file is no longer in this chat. Attach the loan document again, then ask me to register it.",
      });
      return;
    }

    reported.current = true;
    void registerLoanFromChat({
      file,
      overrides: input.overrides,
      cloudProcessing,
      convex,
      userId,
      vaultId,
      keyId,
      ledger: ledgerRef.current,
    })
      .then((output) => {
        if (output.ok) reload();
        onDoneRef.current(output);
      })
      .catch((error: unknown) => {
        onDoneRef.current({
          ok: false,
          error: errorMessage(error, "Could not register the loan"),
        });
      });
  }, [
    cloudProcessing,
    convex,
    input.documentIndex,
    input.overrides,
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
      Registering the loan…
    </p>
  );
}
