import { Button } from "@/components/ui/button";
import { cn } from "cn";
import Link from "next/link";
import type { ReactNode } from "react";

export function EmptyPrompt({
  title,
  description,
  href,
  actionLabel,
  action,
  className,
}: {
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
  action?: ReactNode;
  className?: string;
}) {
  const resolvedAction =
    action ??
    (href && actionLabel ? (
      <Button size="sm" render={<Link href={href} />}>
        {actionLabel}
      </Button>
    ) : null);

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center",
        className,
      )}
    >
      <p className="text-lg font-medium">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        {description}
      </p>
      {resolvedAction ? (
        <div className="mt-4 flex justify-center">{resolvedAction}</div>
      ) : null}
    </div>
  );
}
