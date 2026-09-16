export { mapPool } from "../src/shared/ai/openRouter";
export const aiState = {
  calls: 0,
  inputs: 0,
  fail: false,
  invalid: false,
  confident: true,
};
export async function generateObjectWithFallback({
  prompt,
}: {
  prompt: string;
}) {
  aiState.calls++;
  if (aiState.fail) throw new Error("Provider unavailable");
  const inputs = JSON.parse(prompt.split("INPUT ")[1]) as { id: number }[];
  aiState.inputs += inputs.length;
  return {
    object: {
      results: inputs.map(({ id }) => ({
        id: aiState.invalid ? 99 : id,
        merchant: "Acme",
        path: 0,
        newSubcategory: null,
        spread: "Wants",
        transactionType: "Expense",
        txnCode: "purchase",
        channel: "other",
        tags: [],
        confident: aiState.confident,
      })),
    },
  };
}
