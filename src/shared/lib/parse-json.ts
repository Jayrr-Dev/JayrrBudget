import { errorMessage } from "@/shared/lib/error-message";

export async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      response.ok
        ? "Server returned invalid JSON."
        : `Request failed (${response.status})`,
    );
  }

  if (!response.ok) {
    const payload = data as { error?: string };
    throw new Error(
      typeof payload === "object" && payload && payload.error
        ? payload.error
        : errorMessage(data, `Request failed (${response.status})`),
    );
  }

  return data as T;
}
