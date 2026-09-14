"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            JayrrBudget
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {flow === "signIn" ? "Sign in to your ledger" : "Create your account"}
          </p>
        </div>

        <form
          className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setPending(true);
            const formData = new FormData(event.currentTarget);
            void signIn("password", formData)
              .then(() => {
                router.replace("/");
                router.refresh();
              })
              .catch((err: unknown) => {
                setError(
                  err instanceof Error ? err.message : "Sign-in failed. Try again.",
                );
              })
              .finally(() => setPending(false));
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete={
                flow === "signIn" ? "current-password" : "new-password"
              }
              minLength={8}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <input name="flow" type="hidden" value={flow} />
          {error ? (
            <p className="text-sm text-[var(--spend)]" role="alert">
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
