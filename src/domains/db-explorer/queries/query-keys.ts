export const dbExplorerQueryKeys = {
  all: ["db-explorer"] as const,
  schema: ["db-explorer", "schema"] as const,
  table: (name: string, offset: number, limit: number) =>
    ["db-explorer", "table", name, offset, limit] as const,
};
