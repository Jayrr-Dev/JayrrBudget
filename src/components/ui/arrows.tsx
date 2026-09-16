import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import * as React from "react"

const ARROW_LABELS = {
  left: "Previous",
  right: "Next",
} as const

const arrowsVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent bg-clip-padding text-sm font-medium transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border-control-border bg-surface-elevated hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      shape: {
        square: "rounded-lg",
        tower: "rounded-md",
      },
      size: {
        default: "",
        sm: "",
        lg: "",
      },
    },
    compoundVariants: [
      {
        shape: "square",
        size: "sm",
        class: "size-7 [&_svg]:size-3.5",
      },
      {
        shape: "square",
        size: "default",
        class: "size-9 [&_svg]:size-4",
      },
      {
        shape: "square",
        size: "lg",
        class: "size-10 [&_svg]:size-5",
      },
      {
        shape: "tower",
        size: "sm",
        class: "h-8 w-5 [&_svg]:size-3",
      },
      {
        shape: "tower",
        size: "default",
        class: "h-10 w-6 [&_svg]:size-3.5",
      },
      {
        shape: "tower",
        size: "lg",
        class: "h-12 w-7 [&_svg]:size-4",
      },
    ],
    defaultVariants: {
      variant: "default",
      shape: "square",
      size: "default",
    },
  },
)

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function Arrows({
  className,
  variant = "default",
  shape = "square",
  size = "default",
  direction = "left",
  "aria-label": ariaLabel,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof arrowsVariants> & {
    direction?: keyof typeof ARROW_LABELS
  }) {
  const Icon = direction === "right" ? ChevronRightIcon : ChevronLeftIcon

  return (
    <ButtonPrimitive
      data-slot="arrows"
      data-variant={variant}
      data-shape={shape}
      data-direction={direction}
      aria-label={ariaLabel ?? ARROW_LABELS[direction]}
      className={cn(arrowsVariants({ variant, shape, size, className }))}
      {...props}
    >
      {children ?? <Icon />}
    </ButtonPrimitive>
  )
}

function ArrowsPair({
  className,
  variant = "default",
  size = "default",
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
  ...props
}: React.ComponentProps<"div"> &
  Pick<VariantProps<typeof arrowsVariants>, "variant" | "size"> & {
    previousLabel?: string
    nextLabel?: string
    onPrevious?: React.MouseEventHandler<HTMLButtonElement>
    onNext?: React.MouseEventHandler<HTMLButtonElement>
    previousDisabled?: boolean
    nextDisabled?: boolean
  }) {
  return (
    <div
      role="group"
      data-slot="arrows-pair"
      className={cn("flex items-stretch gap-1", className)}
      {...props}
    >
      <Arrows
        variant={variant}
        shape="tower"
        size={size}
        direction="left"
        aria-label={previousLabel}
        disabled={previousDisabled}
        onClick={onPrevious}
      />
      <Arrows
        variant={variant}
        shape="tower"
        size={size}
        direction="right"
        aria-label={nextLabel}
        disabled={nextDisabled}
        onClick={onNext}
      />
    </div>
  )
}

export { Arrows, ArrowsPair, arrowsVariants }
