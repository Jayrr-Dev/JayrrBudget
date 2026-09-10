export const statementQueryKeys = {
  uploads: ["statements", "uploads"] as const,
  upload: (id: number) => ["statements", "uploads", id] as const,
};
