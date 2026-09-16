import { cn } from "cn"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

function PageSpinner({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-spinner"
      className={cn(
        "flex min-h-[16rem] w-full items-center justify-center py-16 text-[var(--muted-foreground)]",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Loading"
      {...props}
    >
      <Spinner className="size-8" />
    </div>
  )
}

export { PageSpinner, Spinner }
