export type SquareTimelineLevel = 0 | 1 | 2 | 3 | 4;

export type SquareTimelineTone =
  | "empty"
  | "due"
  | "paid"
  | "missed"
  | "paid-tail"
  | "missed-tail";

export type SquareTimelineCell = {
  id: string;
  level: SquareTimelineLevel;
  title: string;
  date?: string;
  tone?: SquareTimelineTone;
  faded?: boolean;
  today?: boolean;
};
