"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";

type TagByDateRangeResponse =
  | {
      ok: true;
      matched: number;
      updated: number;
      tag: string;
      startDate: string;
      endDate: string;
    }
  | { ok?: false; error: string };

async function postTagByDateRange(input: {
  tag: string;
  startDate: string;
  endDate: string;
}) {
  const response = await fetch("/api/transactions/tag-by-date-range", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as TagByDateRangeResponse;
  if (!response.ok || !("matched" in data)) {
    throw new Error(
      "error" in data ? data.error : "Failed to apply tag by date range",
    );
  }
  return data;
}

/** Tags column header with + popover to tag a posted-date window. */
export function TagsColumnHeader() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: postTagByDateRange,
    onSuccess: async (result) => {
      setMessage(
        `Tagged ${result.updated} of ${result.matched} rows with “${result.tag}”.`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      setTag("");
      setStartDate("");
      setEndDate("");
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Failed");
    },
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setMessage(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--muted-foreground)] opacity-60 transition-colors hover:bg-[var(--muted)] hover:opacity-100"
          aria-label="Add tag by date range"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-3 p-3"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <PopoverHeader>
          <PopoverTitle>Tag by date range</PopoverTitle>
          <PopoverDescription>
            Adds the tag to every row whose posted date falls in the range.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-2">
          <div className="space-y-1">
            <Label htmlFor="tag-by-range-name">Tag</Label>
            <Input
              id="tag-by-range-name"
              placeholder="New York 2026"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="tag-by-range-start">Start</Label>
              <Input
                id="tag-by-range-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tag-by-range-end">End</Label>
              <Input
                id="tag-by-range-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={mutation.isPending}
              />
            </div>
          </div>
          {message ? (
            <p className="text-xs text-[var(--muted-foreground)]">{message}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={
              mutation.isPending || !tag.trim() || !startDate || !endDate
            }
            onClick={() =>
              mutation.mutate({
                tag: tag.trim(),
                startDate,
                endDate,
              })
            }
          >
            {mutation.isPending ? "Applying…" : "Apply tag"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
