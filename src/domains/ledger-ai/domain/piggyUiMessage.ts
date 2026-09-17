import type { UIMessage } from "ai";
import {
  APPLY_BUDGET_EDIT_TOOL_NAME,
  type ApplyBudgetEditUITool,
} from "./applyBudgetEditTool";
import { ASK_USER_TOOL_NAME, type AskUserUITool } from "./askUserTool";
import { EXPORT_FILE_TOOL_NAME, type ExportFileUITool } from "./exportFileTool";
import {
  IMPORT_STATEMENT_DOCUMENT_TOOL_NAME,
  type ImportStatementDocumentUITool,
} from "./importStatementDocumentTool";
import {
  REGISTER_LOAN_FROM_DOCUMENT_TOOL_NAME,
  type RegisterLoanFromDocumentUITool,
} from "./registerLoanFromDocumentTool";
import { SHOW_SKETCH_TOOL_NAME, type ShowSketchUITool } from "./sketchBoard";
import {
  ADD_STORE_SHEET_ROW_TOOL_NAME,
  CREATE_TRANSACTION_TOOL_NAME,
  DELETE_TRANSACTIONS_TOOL_NAME,
  RECATEGORIZE_MATCHING_TOOL_NAME,
  REMOVE_STORE_SHEET_ROW_TOOL_NAME,
  RENAME_DESCRIPTIONS_TOOL_NAME,
  UPDATE_TRANSACTION_TOOL_NAME,
  UPDATE_TRANSACTIONS_TOOL_NAME,
  type AddStoreSheetRowUITool,
  type CreateTransactionUITool,
  type DeleteTransactionsUITool,
  type RecategorizeMatchingUITool,
  type RemoveStoreSheetRowUITool,
  type RenameDescriptionsUITool,
  type UpdateTransactionUITool,
  type UpdateTransactionsUITool,
} from "./vaultLedgerWriteTools";

/** UIMessage shape for Piggy chats: text plus the browser-answered tools. */
export type PiggyUIMessage = UIMessage<
  unknown,
  Record<string, never>,
  {
    [ASK_USER_TOOL_NAME]: AskUserUITool;
    [EXPORT_FILE_TOOL_NAME]: ExportFileUITool;
    [SHOW_SKETCH_TOOL_NAME]: ShowSketchUITool;
    [APPLY_BUDGET_EDIT_TOOL_NAME]: ApplyBudgetEditUITool;
    [IMPORT_STATEMENT_DOCUMENT_TOOL_NAME]: ImportStatementDocumentUITool;
    [REGISTER_LOAN_FROM_DOCUMENT_TOOL_NAME]: RegisterLoanFromDocumentUITool;
    [CREATE_TRANSACTION_TOOL_NAME]: CreateTransactionUITool;
    [UPDATE_TRANSACTION_TOOL_NAME]: UpdateTransactionUITool;
    [UPDATE_TRANSACTIONS_TOOL_NAME]: UpdateTransactionsUITool;
    [DELETE_TRANSACTIONS_TOOL_NAME]: DeleteTransactionsUITool;
    [RENAME_DESCRIPTIONS_TOOL_NAME]: RenameDescriptionsUITool;
    [RECATEGORIZE_MATCHING_TOOL_NAME]: RecategorizeMatchingUITool;
    [ADD_STORE_SHEET_ROW_TOOL_NAME]: AddStoreSheetRowUITool;
    [REMOVE_STORE_SHEET_ROW_TOOL_NAME]: RemoveStoreSheetRowUITool;
  }
>;

export type PiggyUIPart = PiggyUIMessage["parts"][number];

export type AskUserPart = Extract<
  PiggyUIPart,
  { type: `tool-${typeof ASK_USER_TOOL_NAME}` }
>;

export type ExportFilePart = Extract<
  PiggyUIPart,
  { type: `tool-${typeof EXPORT_FILE_TOOL_NAME}` }
>;

export type ShowSketchPart = Extract<
  PiggyUIPart,
  { type: `tool-${typeof SHOW_SKETCH_TOOL_NAME}` }
>;

export function isAskUserPart(part: PiggyUIPart): part is AskUserPart {
  return part.type === `tool-${ASK_USER_TOOL_NAME}`;
}

export function isExportFilePart(part: PiggyUIPart): part is ExportFilePart {
  return part.type === `tool-${EXPORT_FILE_TOOL_NAME}`;
}

export function isShowSketchPart(part: PiggyUIPart): part is ShowSketchPart {
  return part.type === `tool-${SHOW_SKETCH_TOOL_NAME}`;
}

export type ApplyBudgetEditPart = Extract<
  PiggyUIPart,
  { type: `tool-${typeof APPLY_BUDGET_EDIT_TOOL_NAME}` }
>;

export function isApplyBudgetEditPart(
  part: PiggyUIPart,
): part is ApplyBudgetEditPart {
  return part.type === `tool-${APPLY_BUDGET_EDIT_TOOL_NAME}`;
}

export type ImportStatementDocumentPart = Extract<
  PiggyUIPart,
  { type: `tool-${typeof IMPORT_STATEMENT_DOCUMENT_TOOL_NAME}` }
>;

export function isImportStatementDocumentPart(
  part: PiggyUIPart,
): part is ImportStatementDocumentPart {
  return part.type === `tool-${IMPORT_STATEMENT_DOCUMENT_TOOL_NAME}`;
}

export type RegisterLoanFromDocumentPart = Extract<
  PiggyUIPart,
  { type: `tool-${typeof REGISTER_LOAN_FROM_DOCUMENT_TOOL_NAME}` }
>;

export function isRegisterLoanFromDocumentPart(
  part: PiggyUIPart,
): part is RegisterLoanFromDocumentPart {
  return part.type === `tool-${REGISTER_LOAN_FROM_DOCUMENT_TOOL_NAME}`;
}

const VAULT_WRITE_TOOL_NAMES = [
  CREATE_TRANSACTION_TOOL_NAME,
  UPDATE_TRANSACTION_TOOL_NAME,
  UPDATE_TRANSACTIONS_TOOL_NAME,
  DELETE_TRANSACTIONS_TOOL_NAME,
  RENAME_DESCRIPTIONS_TOOL_NAME,
  RECATEGORIZE_MATCHING_TOOL_NAME,
  ADD_STORE_SHEET_ROW_TOOL_NAME,
  REMOVE_STORE_SHEET_ROW_TOOL_NAME,
] as const;

export type VaultLedgerWriteToolName = (typeof VAULT_WRITE_TOOL_NAMES)[number];

export type VaultLedgerWritePart = Extract<
  PiggyUIPart,
  { type: `tool-${VaultLedgerWriteToolName}` }
>;

export function isVaultLedgerWritePart(
  part: PiggyUIPart,
): part is VaultLedgerWritePart {
  return VAULT_WRITE_TOOL_NAMES.some(
    (name) => part.type === `tool-${name}`,
  );
}

export function vaultLedgerWriteToolName(
  part: VaultLedgerWritePart,
): VaultLedgerWriteToolName {
  return part.type.slice("tool-".length) as VaultLedgerWriteToolName;
}

/** Parts the transcript renders as cards (question, file, sketch, or vault write). */
export function isPiggyCardPart(
  part: PiggyUIPart,
): part is
  | AskUserPart
  | ExportFilePart
  | ShowSketchPart
  | ApplyBudgetEditPart
  | ImportStatementDocumentPart
  | RegisterLoanFromDocumentPart
  | VaultLedgerWritePart {
  return (
    isAskUserPart(part) ||
    isExportFilePart(part) ||
    isShowSketchPart(part) ||
    isApplyBudgetEditPart(part) ||
    isImportStatementDocumentPart(part) ||
    isRegisterLoanFromDocumentPart(part) ||
    isVaultLedgerWritePart(part)
  );
}
