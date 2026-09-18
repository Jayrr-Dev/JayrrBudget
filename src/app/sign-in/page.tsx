"use client";

import { ProductShowcaseCard } from "@/components/marketing/ProductShowcaseCard";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  clearPendingPasscode,
  setPendingPasscode,
} from "@/crypto/pendingPasscode";
import { MIN_PASSCODE_LENGTH } from "@/domains/vault/application/ensureVaultFromPasscode";
import { authErrorMessage } from "@/shared/lib/auth-error-message";
import { useAuthActions } from "@convex-dev/auth/react";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AuthFlow = "signIn" | "signUp" | "reset" | "resetVerification";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<AuthFlow>("signUp");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Defer password autofill attrs until focus so iCloud / managers
  // don't stack "Enable AutoFill" bubbles over the password field.
  const [passwordAutofillReady, setPasswordAutofillReady] = useState(false);

  const headerLead =
    flow === "signIn"
      ? "Sign in and save money"
      : flow === "signUp"
        ? "Harness your finances and save money."
        : flow === "reset"
          ? "Request a password reset"
          : "Choose a new password";

  return (
    <main className="flex h-full min-h-0 flex-1 items-start justify-center overflow-y-auto overscroll-y-contain bg-[var(--background)] px-4 py-6 sm:items-center sm:py-10">
      <div className="flex w-full max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-center gap-4">
          <img
            src="/icon.svg"
            alt=""
            width={112}
            height={112}
            className="size-[88px] shrink-0 lg:size-28"
          />
          <div className="min-w-0 text-left">
            <h1 className="type-page text-[2rem] leading-none lg:text-[2.75rem]">
              Jayrr&apos;s Budget!
            </h1>
            <p className="type-lead mt-2 text-base lg:text-lg">{headerLead}</p>
          </div>
        </header>
        <div className="grid w-full items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] lg:items-center lg:gap-12">
          <div className="relative z-10 w-full max-w-sm justify-self-center space-y-6 lg:col-start-2 lg:max-w-none lg:justify-self-stretch">
            {flow === "signIn" || flow === "signUp" ? (
              <div
                className="grid grid-cols-2 rounded-lg border border-[var(--border)] bg-surface-elevated p-1"
                aria-label="Account"
              >
                <button
                  type="button"
                  aria-pressed={flow === "signUp"}
                  className={
                    flow === "signUp"
                      ? "min-h-11 w-full touch-manipulation rounded-md bg-primary-subtle px-3 py-2 text-sm font-medium text-primary-subtle-foreground"
                      : "min-h-11 w-full touch-manipulation rounded-md px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setError(null);
                    setFlow("signUp");
                  }}
                  onClick={() => {
                    setError(null);
                    setFlow("signUp");
                  }}
                >
                  Sign up
                </button>
                <button
                  type="button"
                  aria-pressed={flow === "signIn"}
                  className={
                    flow === "signIn"
                      ? "min-h-11 w-full touch-manipulation rounded-md bg-primary-subtle px-3 py-2 text-sm font-medium text-primary-subtle-foreground"
                      : "min-h-11 w-full touch-manipulation rounded-md px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setError(null);
                    setFlow("signIn");
                  }}
                  onClick={() => {
                    setError(null);
                    setFlow("signIn");
                  }}
                >
                  Sign in
                </button>
              </div>
            ) : null}

            <form
              className="space-y-4 rounded-lg border border-[var(--border)] bg-surface-elevated p-6"
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
                  formData.get(
                    flow === "resetVerification" ? "newPassword" : "password",
                  ) ?? "",
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
                  const firstName = String(
                    formData.get("firstName") ?? "",
                  ).trim();
                  const lastName = String(
                    formData.get("lastName") ?? "",
                  ).trim();
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
                    setError(
                      authErrorMessage(
                        err,
                        flow === "signUp" ? "signUp" : "signIn",
                      ),
                    );
                  })
                  .finally(() => setPending(false));
              }}
            >
              {flow === "signUp" ? (
                <div className="grid grid-cols-2 gap-4">
                  <label className="block space-y-2 text-sm">
                    <span className="text-[var(--muted-foreground)]">
                      First name
                    </span>
                    <input
                      name="firstName"
                      type="text"
                      autoComplete="given-name"
                      className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-[var(--foreground)] outline-none focus:border-primary"
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span className="text-[var(--muted-foreground)]">
                      Last name
                    </span>
                    <input
                      name="lastName"
                      type="text"
                      autoComplete="family-name"
                      className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-[var(--foreground)] outline-none focus:border-primary"
                    />
                  </label>
                </div>
              ) : null}
              <label className="block space-y-2 text-sm">
                <span className="text-[var(--muted-foreground)]">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-[var(--foreground)] outline-none focus:border-primary"
                />
              </label>
              {flow === "resetVerification" ? (
                <label className="block space-y-2 text-sm">
                  <span className="text-[var(--muted-foreground)]">
                    Reset code
                  </span>
                  <input
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-[var(--foreground)] outline-none focus:border-primary"
                  />
                </label>
              ) : null}
              {flow !== "reset" ? (
                <label className="relative z-10 block space-y-2 text-sm">
                  <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)]">
                    {flow === "resetVerification" ? "New password" : "Password"}
                    {flow === "signUp" ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="How this password encrypts your ledger"
                            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
                          >
                            <Info className="size-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          side="bottom"
                          sideOffset={8}
                          className="w-[min(20rem,calc(100vw-2rem))]"
                        >
                          <PopoverHeader className="gap-1.5">
                            <PopoverTitle>
                              Your password is the lock
                            </PopoverTitle>
                            <PopoverDescription className="leading-relaxed">
                              This password also encrypts your ledger. Only you
                              can read it.
                            </PopoverDescription>
                          </PopoverHeader>
                        </PopoverContent>
                      </Popover>
                    ) : null}
                  </span>
                  <input
                    name={
                      flow === "resetVerification" ? "newPassword" : "password"
                    }
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
                    onPointerDown={() => {
                      // iOS will not focus a readOnly field, so unlock before focus.
                      setPasswordAutofillReady(true);
                    }}
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
                    className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-[var(--foreground)] outline-none focus:border-primary"
                  />
                </label>
              ) : null}
              {flow === "signUp" || flow === "resetVerification" ? (
                <label className="block space-y-2 text-sm">
                  <span className="text-[var(--muted-foreground)]">
                    Confirm password
                  </span>
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={MIN_PASSCODE_LENGTH}
                    autoComplete="new-password"
                    className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-[var(--foreground)] outline-none focus:border-primary"
                  />
                </label>
              ) : null}
              {flow === "reset" ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Resetting login on this browser updates encryption for this
                  device. A new device still needs the recovery file.
                </p>
              ) : null}
              {flow === "resetVerification" ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  The code expires in 10 minutes. On this browser, encryption
                  uses this new password.
                </p>
              ) : null}
              <input name="flow" type="hidden" value={flow} />
              {error ? (
                <p
                  className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 w-full touch-manipulation rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
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
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    setError(null);
                    setFlow("reset");
                  }}
                >
                  Forgot password?
                </button>
              </p>
            ) : null}
            {flow === "reset" || flow === "resetVerification" ? (
              <p className="text-center text-sm text-[var(--muted-foreground)]">
                Remember your password?{" "}
                <button
                  type="button"
                  className="min-h-11 touch-manipulation text-primary underline-offset-2 hover:underline"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setError(null);
                    setFlow("signIn");
                  }}
                >
                  Sign in
                </button>
              </p>
            ) : null}
          </div>
          <div className="w-full min-w-0 lg:col-start-1 lg:row-start-1">
            <ProductShowcaseCard />
          </div>
        </div>
      </div>
    </main>
  );
}
