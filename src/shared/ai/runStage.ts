import { errorMessage } from "@/shared/ai/errors";

export type StageOk<T> = { ok: true; value: T };
export type StageErr = { ok: false; error: string };
export type StageResult<T> = StageOk<T> | StageErr;

/** Run a pipeline stage without letting it take down later stages. */
export async function runStage<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<StageResult<T>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    const message = errorMessage(error, `${name} failed`);
    console.warn(`[${name}] ${message}`);
    return { ok: false, error: message };
  }
}
