import type { UIMessage } from "ai";
import { ASK_USER_TOOL_NAME, type AskUserUITool } from "./askUserTool";
import {
  EXPORT_FILE_TOOL_NAME,
  type ExportFileUITool,
} from "./exportFileTool";

/** UIMessage shape for Piggy chats: text plus the browser-answered tools. */
export type PiggyUIMessage = UIMessage<
  unknown,
  Record<string, never>,
  {
    [ASK_USER_TOOL_NAME]: AskUserUITool;
    [EXPORT_FILE_TOOL_NAME]: ExportFileUITool;
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

export function isAskUserPart(part: PiggyUIPart): part is AskUserPart {
  return part.type === `tool-${ASK_USER_TOOL_NAME}`;
}

export function isExportFilePart(part: PiggyUIPart): part is ExportFilePart {
  return part.type === `tool-${EXPORT_FILE_TOOL_NAME}`;
}

/** Parts the transcript renders as cards (question or file). */
export function isPiggyCardPart(
  part: PiggyUIPart,
): part is AskUserPart | ExportFilePart {
  return isAskUserPart(part) || isExportFilePart(part);
}
