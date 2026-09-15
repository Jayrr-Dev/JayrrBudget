"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearPendingPasscode, setPendingPasscode } from "@/crypto/pendingPasscode";
import { MIN_PASSCODE_LENGTH } from "@/domains/vault/application/ensureVaultFromPasscode";
import { authErrorMessage } from "@/shared/lib/auth-error-message";

type AuthFlow = "signIn" | "signUp" | "reset" | "resetVerification";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<AuthFlow>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Defer password autofill attrs until focus so iCloud / managers
  // don't stack "Enable AutoFill" bubbles over the password field.
  const [passwordAutofillReady, setPasswordAutofillReady] = useState(false);

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-3 text-center">
          <img
            src="/logo.svg"
            alt=""
            width={72}
            height={72}
            className="size-[72px]"
          />
          <div className="space-y-1">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-[var(--foreground)]">
              Jayrr&apos;s Budget
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {flow === "signIn"
                ? "Sign in to your ledger"
                : flow === "signUp"
                  ? "This password also unlocks your private vault"
                  : flow === "reset"
                    ? "Request a password reset"
                    : "Choose a new password"}
            </p>
          </div>
        </div>

        <form
          className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setPending(true);
            const form = event.currentTarget;
            const formData = new FormData(form);
            const email = String(formData.get("email") ?? "")
              .trim()
              .toLowerCase();
            formData.set("email", email);
            formData.set("flow", flow);
            const typedPassword = String(
              formData.get(flow === "resetVerification" ? "newPassword" : "password") ?? "",
            );
            if (flow === "signUp" || flow === "resetVerification") {
              const confirm = String(formData.get("confirmPassword") ?? "");
              if (typedPassword !== confirm) {
                setError("Passwords do not match.");
                setPending(false);
                return;
              }
              formData.delete("confirmPassword");
            }
            if (flow === "signUp") {
              const firstName = String(formData.get("firstName") ?? "").trim();
              const lastName = String(formData.get("lastName") ?? "").trim();
              formData.set("firstName", firstName);
              formData.set("lastName", lastName);
            } else if (flow === "signIn") {
              formData.delete("firstName");
              formData.delete("lastName");
            }

            if (flow === "reset") {
              formData.delete("password");
              formData.delete("newPassword");
              formData.delete("code");
            } else if (typedPassword) {
              setPendingPasscode(typedPassword);
            }

            void signIn("password", formData)
              .then((result) => {
                if (result.signingIn) {
                  router.replace("/");
                  router.refresh();
                  return;
                }
                if (flow === "reset") {
                  setError(null);
                  setFlow("resetVerification");
                  return;
                }
                setError("Check your email if you were sent a code.");
              })
              .catch((err: unknown) => {
                clearPendingPasscode();
                setError(authErrorMessage(err, flow === "signUp" ? "signUp" : "signIn"));
              })
              .finally(() => setPending(false));
          }}
        >
          {flow === "signUp" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">First name</span>
                <input
                  name="firstName"
                  type="text"
                  required
                  autoComplete="given-name"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">Last name</span>
                <input
                  name="lastName"
                  type="text"
                  required
                  autoComplete="family-name"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
          ) : null}
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          {flow === "resetVerification" ? (
            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted-foreground)]">Reset code</span>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              />
            </label>
          ) : null}
          {flow !== "reset" ? <label className="relative z-10 block space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">
              {flow === "resetVerification" ? "New password" : "Password"}
            </span>
            <input
              name={flow === "resetVerification" ? "newPassword" : "password"}
              type="password"
              required
              autoComplete={
                passwordAutofillReady
                  ? flow === "signIn"
                    ? "current-password"
                    : "new-password"
                  : "off"
              }
              minLength={MIN_PASSCODE_LENGTH}
              readOnly={!passwordAutofillReady}
              onFocus={(event) => {
                  setPasswordAutofillReady(true);
                const input = event.currentTarget;
                input.readOnly = false;
                requestAnimationFrame(() => {
                  input.scrollIntoView({
                    block: "center",
                    behavior: "smooth",
                  });
                });
              }}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
          </label> : null}
          {flow === "signUp" || flow === "resetVerification" ? (
            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted-foreground)]">Confirm password</span>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={MIN_PASSCODE_LENGTH}
                autoComplete="new-password"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              />
            </label>
          ) : null}
          {flow === "signUp" ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              This is also your private vault passcode. Convex stores a wrapped key, not the password itself.
            </p>
          ) : null}
          {flow === "reset" ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Resetting login on this browser updates the vault passcode after you have unlocked here once. A new device still needs the recovery file.
            </p>
          ) : null}
          {flow === "resetVerification" ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              The code expires in 10 minutes. On this browser the vault passcode becomes this new password automatically.
            </p>
          ) : null}
          <input name="flow" type="hidden" value={flow} />
          {error ? (
            <p
              className="rounded-md border border-[var(--spend)]/30 bg-[var(--spend)]/5 px-3 py-2 text-sm text-[var(--spend)]"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-60"
          >
            {pending
              ? "Working…"
              : flow === "signIn"
                ? "Sign in"
                : flow === "signUp"
                  ? "Create account"
                  : flow === "reset"
                    ? "Email reset code"
                    : "Reset password"}
          </button>
        </form>

        {flow === "signIn" ? (
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            <button
              type="button"
              className="text-[var(--accent)] underline-offset-2 hover:underline"
              onClick={() => {
                setError(null);
                setFlow("reset");
              }}
            >
              Forgot password?
            </button>
            <span className="mx-2">·</span>
            Need an account?{" "}
            <button
              type="button"
              className="text-[var(--accent)] underline-offset-2 hover:underline"
              onClick={() => {
                setError(null);
                setFlow("signUp");
              }}
            >
              Sign up
            </button>
          </p>
        ) : (
        <p className="text-center text-sm text-[var(--muted-foreground)]">
          {flow === "signUp" ? "Already have an account?" : "Remember your password?"}{" "}
          <button
            type="button"
            className="text-[var(--accent)] underline-offset-2 hover:underline"
            onClick={() => {
              setError(null);
              setFlow(flow === "signUp" ? "signIn" : "signIn");
            }}
          >
            {flow === "signUp" ? "Sign in" : "Sign in"}
          </button>
        </p>
        )}
      </div>
    </main>
  );
}
