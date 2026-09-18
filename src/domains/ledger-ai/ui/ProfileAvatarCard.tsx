"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UserMascot } from "@/domains/ledger-ai/ui/UserMascot";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import {
  resolveUserIcon,
  USER_ICON_IDS,
  USER_ICON_LABELS,
  type UserIconId,
} from "@convex/lib/userIcons";
import { useMutation } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";

type Props = {
  avatarIcon: UserIconId;
};

export function ProfileAvatarCard({ avatarIcon }: Props) {
  const updateAvatarIcon = useMutation(api.users.updateAvatarIcon);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    const avatarIcon = resolveUserIcon(next);
    setError(null);
    setPending(true);
    try {
      await updateAvatarIcon({ avatarIcon });
    } catch (err: unknown) {
      setError(errorMessage(err, "Could not save avatar."));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-4 sm:p-6">
      <h2 className="type-section flex items-center gap-2">
        Avatar
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
              aria-label="About avatar"
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
              <PopoverTitle>Avatar</PopoverTitle>
              <PopoverDescription>
                The icon shown next to your messages in Piggy chat.
              </PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>
      <p className="sr-only">
        Pick the icon shown next to your messages in Piggy chat.
      </p>

      <RadioGroup
        value={avatarIcon}
        onValueChange={onChange}
        disabled={pending}
        aria-label="Avatar icon"
        className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {USER_ICON_IDS.map((id) => {
          const selected = id === avatarIcon;
          return (
            <label
              key={id}
              className={cn(
                "flex min-w-0 w-full cursor-pointer flex-col items-center gap-2 rounded-lg border px-2 py-3 transition-colors",
                selected
                  ? "border-primary bg-accent-subtle"
                  : "border-border hover:bg-surface-subtle",
                pending && "cursor-default opacity-60",
              )}
            >
              <UserMascot icon={id} iconClassName="size-12 sm:size-14" />
              <span className="flex min-w-0 items-center justify-center gap-1.5 text-center text-sm leading-tight">
                <RadioGroupItem value={id} />
                <span className="min-w-0">{USER_ICON_LABELS[id]}</span>
              </span>
            </label>
          );
        })}
      </RadioGroup>

      {error ? (
        <p
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
