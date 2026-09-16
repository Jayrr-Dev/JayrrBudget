"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { EmptyPrompt } from "@/components/ui/empty-prompt";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type IssueStatus = "open" | "resolved" | "dismissed";

type IssueRow = {
  id: Id<"issues">;
  message: string;
  stack: string | null;
  componentStack: string | null;
  url: string | null;
  userNote: string | null;
  status: IssueStatus;
  source: "error_boundary" | "manual";
  createdAt: number;
  updatedAt: number;
  reporterEmail: string | null;
};

const columnHelper = createColumnHelper<DataTableFeatures, IssueRow>();

function sourceLabel(source: IssueRow["source"]) {
  if (source === "error_boundary") return "Error screen";
  return "Submitted";
}

function StatusActions({ issue }: { issue: IssueRow }) {
  const updateStatus = useMutation(api.issues.updateStatus);
  const remove = useMutation(api.issues.remove);

  async function setStatus(status: IssueStatus) {
    try {
      await updateStatus({ issueId: issue.id, status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleDelete() {
    try {
      await remove({ issueId: issue.id });
      toast.success("Issue removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {issue.status !== "open" ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => void setStatus("open")}
        >
          Reopen
        </Button>
      ) : null}
      {issue.status !== "resolved" ? (
        <Button
          type="button"
          size="xs"
          variant="secondary"
          onClick={() => void setStatus("resolved")}
        >
          Resolve
        </Button>
      ) : null}
      {issue.status !== "dismissed" ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => void setStatus("dismissed")}
        >
          Dismiss
        </Button>
      ) : null}
      <Button
        type="button"
        size="xs"
        variant="destructive"
        onClick={() => void handleDelete()}
      >
        Delete
      </Button>
    </div>
  );
}

function statusVariant(
  status: IssueStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "open") return "destructive";
  if (status === "resolved") return "secondary";
  return "outline";
}

const columns = columnHelper.columns([
  columnHelper.accessor("createdAt", {
    header: "When",
    cell: ({ getValue }) => (
      <span className="text-xs text-[var(--muted-foreground)]">
        {new Date(Number(getValue())).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    ),
    meta: { width: "8.5rem", nowrap: true },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => (
      <Badge variant={statusVariant(getValue() as IssueStatus)}>
        {String(getValue())}
      </Badge>
    ),
    meta: { width: "7rem", nowrap: true },
  }),
  columnHelper.accessor("message", {
    header: "Issue",
    cell: ({ row }) => {
      const extra = [row.original.url, row.original.userNote]
        .filter(Boolean)
        .join(" · ");
      const title = extra
        ? `${row.original.message}\n${extra}`
        : row.original.message;
      return (
        <span className="block truncate font-medium" title={title}>
          {row.original.message}
        </span>
      );
    },
    filterFn: "includesString",
    meta: { width: "22rem", nowrap: true, grow: true },
  }),
  columnHelper.accessor("source", {
    header: "Source",
    cell: ({ getValue }) => (
      <Badge variant="outline">
        {sourceLabel(getValue() as IssueRow["source"])}
      </Badge>
    ),
    meta: { width: "8rem", nowrap: true },
  }),
  columnHelper.accessor("reporterEmail", {
    header: "Reporter",
    cell: ({ getValue }) => (
      <span className="block truncate text-sm text-[var(--muted-foreground)]">
        {getValue() ? String(getValue()) : "-"}
      </span>
    ),
    meta: { width: "12rem", nowrap: true },
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: ({ row }) => <StatusActions issue={row.original} />,
    meta: { label: "Actions", width: "10rem", nowrap: true },
  }),
]);

function ReportIssueForm() {
  const createIssue = useMutation(api.issues.create);
  const [message, setMessage] = useState("");
  const [userNote, setUserNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Describe the issue");
      return;
    }
    setSubmitting(true);
    try {
      await createIssue({
        message: trimmed,
        userNote: userNote.trim() || null,
        url: typeof window !== "undefined" ? window.location.href : null,
        source: "manual",
      });
      setMessage("");
      setUserNote("");
      toast.success("Issue submitted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h2 className="font-heading text-base font-semibold tracking-tight">
        Report an issue
      </h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Describe what went wrong or what you need help with.
      </p>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="issue-message">What happened</Label>
          <Input
            id="issue-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Short summary"
            maxLength={4000}
            required
            disabled={submitting}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="issue-note">Details (optional)</Label>
          <Textarea
            id="issue-note"
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="Steps to reproduce, page, or anything useful"
            maxLength={2000}
            rows={3}
            disabled={submitting}
          />
        </div>
        <div>
          <Button type="submit" disabled={submitting || !message.trim()}>
            {submitting ? "Sending…" : "Submit issue"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function IssuesManager() {
  const issues = useQuery(api.issues.list, {});

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <ReportIssueForm />
      </div>

      <div className="min-w-0 lg:col-span-2">
        {issues === undefined ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Loading issues…
          </p>
        ) : issues.length === 0 ? (
          <EmptyPrompt
            className="bg-[var(--surface)] py-10"
            title="No issues yet"
            description="Submitted reports and crash-screen filings show up here."
            action={
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  document.getElementById("issue-message")?.focus()
                }
              >
                Report an issue
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={issues as IssueRow[]}
            searchKey="message"
            searchPlaceholder="Filter issues…"
          />
        )}
      </div>
    </div>
  );
}
