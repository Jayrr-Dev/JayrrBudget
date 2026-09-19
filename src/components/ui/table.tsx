"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";

const tableVariants = cva(
  [
    "w-full caption-bottom text-sm",
    "[&_th[data-sticky-col]]:sticky [&_th[data-sticky-col]]:left-0 [&_th[data-sticky-col]]:z-20 [&_th[data-sticky-col]]:bg-surface-elevated",
    "[&_td[data-sticky-col]]:sticky [&_td[data-sticky-col]]:left-0 [&_td[data-sticky-col]]:z-10 [&_td[data-sticky-col]]:bg-surface-elevated",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "",
        lined: [
          "border-collapse",
          "[&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border",
        ].join(" "),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** Puts the horizontal scrollbar above content via rotateX (un-flip children). */
function ScrollTopX({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-top-x"
      className={cn(
        "overflow-x-auto overflow-y-hidden [transform:rotateX(180deg)]",
        className,
      )}
      {...props}
    >
      <div className="[transform:rotateX(180deg)]">{children}</div>
    </div>
  );
}

function Table({
  className,
  containerClassName,
  variant = "default",
  ...props
}: React.ComponentProps<"table"> & {
  containerClassName?: string;
} & VariantProps<typeof tableVariants>) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "relative w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain",
        containerClassName,
      )}
    >
      <table
        data-slot="table"
        data-variant={variant}
        className={cn("group/table", tableVariants({ variant }), className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b group-data-[variant=lined]/table:[&_tr]:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-primary-subtle group-data-[variant=lined]/table:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  ScrollTopX,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  tableVariants,
};
