export type TreeRef = {
  section: string;
  category: string;
  type: string;
};

export type CategoryRule = {
  categoryDetailed: string;
  categoryPrimary?: string;
  tags?: string[];
  tree?: TreeRef;
  merchantClean?: string;
  patterns: RegExp[];
};
