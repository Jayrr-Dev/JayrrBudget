"use client";

import { api } from "@convex/_generated/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";

function splitName(fullName: string | null | undefined) {
  const parts = fullName?.trim().split(/\s+/) ?? [];
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export default function ProfilePage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const updateProfile = useMutation(api.users.updateProfile);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me) return;
    const next = splitName(me.name);
    setFirstName(next.firstName);
    setLastName(next.lastName);
  }, [me]);

  if (me === undefined || me === null) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <header className="space-y-1 border-b border-[var(--border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="text-[var(--muted-foreground)]">
          Your name and sign-in details.
        </p>
      </header>

      <form
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSaved(false);
          setPending(true);
          void updateProfile({ firstName, lastName })
            .then(() => setSaved(true))
            .catch((err: unknown) => {
              setError(
                err instanceof Error ? err.message : "Could not save profile.",
              );
            })
            .finally(() => setPending(false));
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">First name</span>
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
              autoComplete="given-name"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">Last name</span>
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
              autoComplete="family-name"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted-foreground)]">Email</span>
          <input
            value={me.email ?? ""}
            readOnly
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--muted-foreground)] outline-none"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted-foreground)]">Role</span>
          <input
            value={me.role}
            readOnly
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize text-[var(--muted-foreground)] outline-none"
          />
        </label>

        {error ? (
          <p
            className="rounded-md border border-[var(--spend)]/30 bg-[var(--spend)]/5 px-3 py-2 text-sm text-[var(--spend)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="text-sm text-[var(--muted-foreground)]">Saved.</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
