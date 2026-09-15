export type TreeRef = {
  section: string;
  category: string;
  type: string;
};

export type CategoryRule = {
  tags?: string[];
  tree: TreeRef;
  merchantClean?: string;
  patterns: RegExp[];
};
