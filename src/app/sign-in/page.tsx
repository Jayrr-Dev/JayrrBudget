"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authErrorMessage } from "@/shared/lib/auth-error-message";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
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
                : "Create your account"}
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
            if (flow === "signUp") {
              const firstName = String(formData.get("firstName") ?? "").trim();
              const lastName = String(formData.get("lastName") ?? "").trim();
              formData.set("firstName", firstName);
              formData.set("lastName", lastName);
            } else {
              formData.delete("firstName");
              formData.delete("lastName");
            }

            void signIn("password", formData)
              .then((result) => {
                if (result.signingIn) {
                  router.replace("/");
                  router.refresh();
                  return;
                }
                setError(
                  "Sign-in needs another step. Check your email if you were sent a code.",
                );
              })
              .catch((err: unknown) => {
                setError(authErrorMessage(err, flow));
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
          <label className="relative z-10 block space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete={
                passwordAutofillReady
                  ? flow === "signIn"
                    ? "current-password"
                    : "new-password"
                  : "off"
              }
              minLength={8}
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
          </label>
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
                : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--muted-foreground)]">
          {flow === "signIn" ? "Need an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="text-[var(--accent)] underline-offset-2 hover:underline"
            onClick={() => {
              setError(null);
              setFlow(flow === "signIn" ? "signUp" : "signIn");
            }}
          >
            {flow === "signIn" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
