"use client";

import { VaultSecurityCard } from "@/components/layout/VaultSecurityCard";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PageSpinner } from "@/components/ui/spinner";
import { ProfileAiByokCard } from "@/domains/ai-keys/ui/ProfileAiByokCard";
import { ProfileAiUsageCard } from "@/domains/ai-keys/ui/ProfileAiUsageCard";
import { ProfileBillingCard } from "@/domains/billing/ui/ProfileBillingCard";
import { ProfileAvatarCard } from "@/domains/ledger-ai/ui/ProfileAvatarCard";
import { resolveOcrMode } from "@/domains/statements/domain/ocrMode";
import { ProfileOcrModeCard } from "@/domains/statements/ui/ProfileOcrModeCard";
import { api } from "@convex/_generated/api";
import { resolveUserIcon } from "@convex/lib/userIcons";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";

const PROFILE_TABS = [
  { id: "personalize", label: "Personalize" },
  { id: "documents", label: "Documents" },
  { id: "usage", label: "Usage" },
  { id: "security", label: "Security" },
] as const;

type ProfileTab = (typeof PROFILE_TABS)[number]["id"];

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
  const [tab, setTab] = useState<ProfileTab>("personalize");

  useEffect(() => {
    if (!me) return;
    const next = splitName(me.name);
    setFirstName(next.firstName);
    setLastName(next.lastName);
  }, [me]);

  if (me === undefined || me === null) {
    return <PageSpinner />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2 border-b border-[var(--border)] pb-6">
        <h1 className="type-page flex items-center gap-2">
          Profile
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                aria-label="About profile"
              >
                <Info className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={8}
              className="w-80 gap-0 p-3.5"
            >
              <PopoverHeader className="gap-1.5">
                <PopoverTitle>Profile</PopoverTitle>
                <PopoverDescription>
                  Your name, sign-in, scan, AI key, and encryption settings.
                </PopoverDescription>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                  <li>The same password protects ledger data on this device</li>
                  <li>An optional OpenRouter key is stored as ciphertext</li>
                </ul>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </h1>
        <p className="sr-only">
          Your name, sign-in, and encryption settings. The same password
          protects ledger data on this device.
        </p>
      </header>

      <ButtonGroup
        className="w-full max-w-full flex-wrap"
        aria-label="Profile sections"
      >
        {PROFILE_TABS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={tab === item.id ? "default" : "outline"}
            className="flex-1"
            onClick={() => setTab(item.id)}
            aria-pressed={tab === item.id}
          >
            {item.label}
          </Button>
        ))}
      </ButtonGroup>

      {tab === "personalize" ? (
        <div className="space-y-8">
          <form
            className="space-y-4 rounded-xl border border-border bg-surface-elevated p-6"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              setSaved(false);
              setPending(true);
              void updateProfile({ firstName, lastName })
                .then(() => setSaved(true))
                .catch((err: unknown) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not save profile.",
                  );
                })
                .finally(() => setPending(false));
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <label className="block space-y-2 text-sm">
                <span className="text-[var(--muted-foreground)]">
                  First name
                </span>
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                  autoComplete="given-name"
                  className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-foreground outline-none focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-ring"
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span className="text-[var(--muted-foreground)]">
                  Last name
                </span>
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                  autoComplete="family-name"
                  className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-foreground outline-none focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-ring"
                />
              </label>
            </div>

            <label className="block space-y-2 text-sm">
              <span className="text-[var(--muted-foreground)]">Email</span>
              <input
                value={me.email ?? ""}
                readOnly
                className="w-full rounded-md border border-control-border bg-surface-subtle px-3 py-2 text-[var(--muted-foreground)] outline-none"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="text-[var(--muted-foreground)]">Role</span>
              <input
                value={me.role}
                readOnly
                className="w-full rounded-md border border-control-border bg-surface-subtle px-3 py-2 capitalize text-[var(--muted-foreground)] outline-none"
              />
            </label>

            {error ? (
              <p
                className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
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
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </form>

          <ProfileAvatarCard avatarIcon={resolveUserIcon(me.avatarIcon)} />
          <ProfileBillingCard />
        </div>
      ) : null}

      {tab === "documents" ? (
        <ProfileOcrModeCard ocrMode={resolveOcrMode(me.ocrMode)} />
      ) : null}

      {tab === "usage" ? <ProfileAiUsageCard /> : null}

      {tab === "security" ? (
        <div className="space-y-8">
          <ProfileAiByokCard />
          <VaultSecurityCard />
        </div>
      ) : null}
    </div>
  );
}
