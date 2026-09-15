"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type BoundaryProps = {
  children: ReactNode;
};

type BoundaryState = {
  error: Error | null;
  componentStack: string | null;
  reported: boolean;
};

type FallbackProps = {
  error: Error;
  componentStack: string | null;
  reported: boolean;
  onReported: () => void;
  onReset: () => void;
};

function ErrorFallback({
  error,
  componentStack,
  reported,
  onReported,
  onReset,
}: FallbackProps) {
  const createIssue = useMutation(api.issues.create);

  async function handleReport() {
    try {
      await createIssue({
        message: error.message || String(error),
        stack: error.stack ?? null,
        componentStack,
        url: typeof window !== "undefined" ? window.location.href : null,
        source: "error_boundary",
      });
      onReported();
      toast.success("Error reported. Thanks.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not report error",
      );
    }
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-heading text-sm font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        Something broke
      </p>
      <h1 className="mt-2 max-w-lg font-heading text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        This screen hit an unexpected error
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--muted-foreground)]">
        Like a receipt that will not print. The page stopped mid-job. You can
        report it so it shows up under Issues, then try again.
      </p>
      <pre className="mt-6 max-h-40 w-full max-w-xl overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left font-mono text-xs text-[var(--destructive)]">
        {error.message || String(error)}
      </pre>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          onClick={() => void handleReport()}
          disabled={reported}
        >
          {reported ? "Reported" : "Report Error"}
        </Button>
        <Button type="button" variant="outline" onClick={onReset}>
          Try again
        </Button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = {
    error: null,
    componentStack: null,
    reported: false,
  };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error, reported: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({
      error,
      componentStack: info.componentStack ?? null,
    });
  }

  reset = () => {
    this.setState({ error: null, componentStack: null, reported: false });
  };

  render() {
    const { error, componentStack, reported } = this.state;
    if (error) {
      return (
        <ErrorFallback
          error={error}
          componentStack={componentStack}
          reported={reported}
          onReported={() => this.setState({ reported: true })}
          onReset={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
