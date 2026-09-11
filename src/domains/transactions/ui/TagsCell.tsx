"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";

type AddTagResponse =
  | { ok: true; tags: string[]; added: boolean; tag: string }
  | { ok?: false; error: string };

async function postAddTag(input: { transactionId: string; tag: string }) {
  const response = await fetch("/api/transactions/add-tag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as AddTagResponse;
  if (!response.ok || !("tags" in data)) {
    throw new Error("error" in data ? data.error : "Failed to add tag");
  }
  return data;
}

type TagsCellProps = {
  transactionId: string;
  tags: string[];
};

/** Tag chips plus a + control to add one tag to this row. */
export function TagsCell({ transactionId, tags }: TagsCellProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: postAddTag,
    onSuccess: async () => {
      setTag("");
      setError(null);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed");
    },
  });

  function submit() {
    const next = tag.trim();
    if (!next || mutation.isPending) return;
    mutation.mutate({ transactionId, tag: next });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {tags.length === 0 ? (
        <span className="text-sm text-[var(--muted-foreground)]">—</span>
      ) : (
        tags.map((value, index) => (
          <span
            key={`${index}-${value}`}
            className="max-w-full rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[11px] leading-snug font-medium break-words text-[var(--foreground)]"
          >
            {value}
          </span>
        ))
      )}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTag("");
            setError(null);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--muted-foreground)] opacity-50 transition-colors hover:bg-[var(--muted)] hover:opacity-100"
            aria-label="Add tag"
          >
            <PlusIcon className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 gap-2 p-2">
          <Input
            placeholder="Tag name"
            value={tag}
            autoFocus
            disabled={mutation.isPending}
            onChange={(event) => setTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          {error ? (
            <p className="text-xs text-[var(--destructive)]">{error}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={mutation.isPending || !tag.trim()}
            onClick={submit}
          >
            {mutation.isPending ? "Adding…" : "Add"}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
