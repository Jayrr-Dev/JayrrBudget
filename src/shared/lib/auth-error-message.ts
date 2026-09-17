/**
 * Map Convex Auth / Password provider errors to short user-facing copy.
 * Server codes often arrive wrapped in "Uncaught Error: InvalidSecret".
 */
export function authErrorMessage(
  error: unknown,
  flow: "signIn" | "signUp" = "signIn",
): string {
  const raw = extractRawMessage(error);

  if (
    matches(raw, "InvalidSecret", "Invalid credentials", "Invalid password")
  ) {
    return flow === "signIn"
      ? "Wrong email or password. Check both and try again."
      : "That password doesn’t meet the requirements (at least 8 characters).";
  }

  if (matches(raw, "InvalidAccountId")) {
    return flow === "signIn"
      ? "No account found for that email. Use Sign up, or check the address."
      : "Could not create that account. Try a different email.";
  }

  if (matches(raw, "TooManyFailedAttempts")) {
    return "Too many failed attempts. Wait a minute, then try again.";
  }

  if (matches(raw, "already exists", "AccountAlreadyExists")) {
    return "An account with that email already exists. Use Sign in instead.";
  }

  if (matches(raw, "Missing `password`", "Missing password")) {
    return "Enter a password.";
  }

  if (matches(raw, "Missing `flow`")) {
    return "Something went wrong with the form. Refresh and try again.";
  }

  if (matches(raw, "Invalid code")) {
    return "That code is invalid or expired. Request a new one.";
  }

  if (matches(raw, "Email is required")) {
    return "Enter your email address.";
  }

  // Strip Convex request-id noise if we somehow got a plain message
  const cleaned = raw
    .replace(/^\[Request ID:[^\]]+\]\s*/i, "")
    .replace(/^Server Error\s*/i, "")
    .replace(/^Uncaught Error:\s*/i, "")
    .trim();

  if (cleaned && cleaned.length < 120 && !/^\[CONVEX/i.test(cleaned)) {
    return cleaned;
  }

  return flow === "signIn"
    ? "Couldn’t sign in. Check your email and password, then try again."
    : "Couldn’t create the account. Try again.";
}

function extractRawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function matches(raw: string, ...needles: string[]): boolean {
  const lower = raw.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}
