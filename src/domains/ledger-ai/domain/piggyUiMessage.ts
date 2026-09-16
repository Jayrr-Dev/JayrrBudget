import type { UIMessage } from "ai";
import { ASK_USER_TOOL_NAME, type AskUserUITool } from "./askUserTool";
import {
  EXPORT_FILE_TOOL_NAME,
  type ExportFileUITool,
} from "./exportFileTool";
import {
  SHOW_SKETCH_TOOL_NAME,
  type ShowSketchUITool,
} from "./sketchBoard";

/** UIMessage shape for Piggy chats: text plus the browser-answered tools. */
export type PiggyUIMessage = UIMessage<
  unknown,
  Record<string, never>,
  {
    [ASK_USER_TOOL_NAME]: AskUserUITool;
    [EXPORT_FILE_TOOL_NAME]: ExportFileUITool;
    [SHOW_SKETCH_TOOL_NAME]: ShowSketchUITool;
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

/** Parts the transcript renders as cards (question, file, or sketch). */
export function isPiggyCardPart(
  part: PiggyUIPart,
): part is AskUserPart | ExportFilePart | ShowSketchPart {
  return isAskUserPart(part) || isExportFilePart(part) || isShowSketchPart(part);
}
