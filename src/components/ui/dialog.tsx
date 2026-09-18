"use client";

import { useMinimizedDialogsRegistry } from "@/components/ui/dialog-minimize-registry";
import { cn } from "cn";
import { CircleX } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { Button } from "@/components/ui/button";

type DialogRootMinimizeContextValue = {
  isMinimized: boolean;
  setIsMinimized: (minimized: boolean) => void;
  requestClose: () => void;
};

const DialogRootMinimizeContext =
  React.createContext<DialogRootMinimizeContextValue | null>(null);

const COPY_DIALOG_MAXIMIZE_ACTION_LABEL = "Maximize";
const COPY_DIALOG_RESTORE_ACTION_LABEL = "Restore";
const COPY_DIALOG_MINIMIZE_ACTION_LABEL = "Minimize to corner";
const COPY_DIALOG_MINIMIZED_LABEL_FALLBACK = "Dialog";

const DIALOG_UNPADDED_CLASS = /(^|\s)p-0(\s|$)/;

const DIALOG_CHROME_ACTIONS_CONTAINER_CLASS =
  "absolute top-0 right-0 z-10 flex h-6 w-fit items-center justify-end gap-0 bg-popover px-0.5";

const DIALOG_CHROME_ACTIONS_PADDED_CLASS = "top-1.5 right-1.5";

const DIALOG_CHROME_ACTION_BUTTON_CLASS =
  "group inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-xs p-0 opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden disabled:pointer-events-none disabled:opacity-40";

const DIALOG_CHROME_CLOSE_ICON_CLASS =
  "pointer-events-none size-4 text-muted-foreground transition-colors group-hover:text-red-600 dark:group-hover:text-red-400";

const DIALOG_CHROME_MAXIMIZE_ICON_CLASS =
  "pointer-events-none size-4 text-muted-foreground transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400";

const DIALOG_CHROME_MINIMIZE_ICON_CLASS =
  "pointer-events-none size-4 text-muted-foreground transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400";

const DIALOG_CHROME_CIRCLE_ICON_SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  xmlns: "http://www.w3.org/2000/svg",
};

const DIALOG_NESTED_PORTAL_MENU_SELECTOR = [
  "[data-slot=dropdown-menu-content]",
  "[data-slot=dropdown-menu-trigger]",
  "[data-slot=combobox-content]",
  "[data-slot=popover-content]",
  "[data-slot=select-content]",
  "[data-radix-popper-content-wrapper]",
].join(", ");

function isNestedPortalEvent(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest(DIALOG_NESTED_PORTAL_MENU_SELECTOR))
  );
}

function DialogSquareCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden
      {...DIALOG_CHROME_CIRCLE_ICON_SVG_PROPS}
    >
      <circle cx="12" cy="12" r="10" />
      <rect x="8.5" y="8.5" width="7" height="7" />
    </svg>
  );
}

function DialogMinimizeCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden
      {...DIALOG_CHROME_CIRCLE_ICON_SVG_PROPS}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
    </svg>
  );
}

function Dialog({
  onOpenChange,
  modal,
  open,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [isMinimized, setIsMinimized] = React.useState(false);

  const mergedOnOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setIsMinimized(false);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );

  React.useEffect(() => {
    if (open === false) {
      setIsMinimized(false);
    }
  }, [open]);

  const requestClose = React.useCallback(() => {
    setIsMinimized(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const minimizeContextValue = React.useMemo(
    (): DialogRootMinimizeContextValue => ({
      isMinimized,
      setIsMinimized,
      requestClose,
    }),
    [isMinimized, requestClose],
  );

  return (
    <DialogRootMinimizeContext.Provider value={minimizeContextValue}>
      <DialogPrimitive.Root
        data-slot="dialog"
        {...props}
        open={open}
        modal={modal ?? !isMinimized}
        onOpenChange={mergedOnOpenChange}
      />
    </DialogRootMinimizeContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:pointer-events-none data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  showMaximizeButton = true,
  showMinimizeButton = true,
  minimizeLabel,
  defaultMaximized = false,
  onPointerDownOutside,
  onFocusOutside,
  onInteractOutside,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  showMaximizeButton?: boolean;
  showMinimizeButton?: boolean;
  minimizeLabel?: string;
  defaultMaximized?: boolean;
}) {
  const [isMaximized, setIsMaximized] = React.useState(defaultMaximized);
  const rootMinimize = React.useContext(DialogRootMinimizeContext);
  const minimizedDialogsRegistry = useMinimizedDialogsRegistry();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const minimizedDialogId = React.useId();
  const [minimizedDialogLabel, setMinimizedDialogLabel] = React.useState<
    string | null
  >(null);

  const canMinimize =
    showMinimizeButton &&
    showCloseButton &&
    rootMinimize != null &&
    minimizedDialogsRegistry != null;
  const isMinimizedActive = Boolean(rootMinimize?.isMinimized) && canMinimize;
  const isUnpaddedContent = DIALOG_UNPADDED_CLASS.test(className ?? "");
  const maximizeActionLabel = isMaximized
    ? COPY_DIALOG_RESTORE_ACTION_LABEL
    : COPY_DIALOG_MAXIMIZE_ACTION_LABEL;

  const minimizeDialog = React.useCallback(() => {
    if (!rootMinimize) {
      return;
    }
    const labelledById = contentRef.current?.getAttribute("aria-labelledby");
    const titleText = labelledById
      ? document.getElementById(labelledById)?.textContent?.trim()
      : undefined;
    setMinimizedDialogLabel(
      minimizeLabel?.trim() ||
        titleText ||
        COPY_DIALOG_MINIMIZED_LABEL_FALLBACK,
    );
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    rootMinimize.setIsMinimized(true);
  }, [minimizeLabel, rootMinimize]);

  const registerMinimizedDialog = minimizedDialogsRegistry?.register;
  const unregisterMinimizedDialog = minimizedDialogsRegistry?.unregister;

  React.useEffect(() => {
    if (
      !isMinimizedActive ||
      !rootMinimize ||
      !registerMinimizedDialog ||
      !unregisterMinimizedDialog
    ) {
      return;
    }
    registerMinimizedDialog({
      id: minimizedDialogId,
      label: minimizedDialogLabel ?? COPY_DIALOG_MINIMIZED_LABEL_FALLBACK,
      restore: () => rootMinimize.setIsMinimized(false),
      requestClose: rootMinimize.requestClose,
    });
    return () => {
      unregisterMinimizedDialog(minimizedDialogId);
    };
  }, [
    isMinimizedActive,
    minimizedDialogId,
    minimizedDialogLabel,
    registerMinimizedDialog,
    rootMinimize,
    unregisterMinimizedDialog,
  ]);

  return (
    <DialogPortal>
      <div
        inert={isMinimizedActive || undefined}
        data-dialog-minimized={isMinimizedActive ? "" : undefined}
        className={cn(
          "fixed inset-0 isolate z-50 translate-z-0",
          isMinimizedActive && "invisible pointer-events-none",
        )}
      >
        <DialogOverlay className="!absolute !inset-0 !z-0" />
        <DialogPrimitive.Content
          ref={(node) => {
            contentRef.current = node;
          }}
          data-slot="dialog-content"
          data-maximized={isMaximized ? "" : undefined}
          data-dialog-minimized={isMinimizedActive ? "" : undefined}
          className={cn(
            "relative z-10 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain",
            "fixed top-1/2 left-1/2 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
            isMaximized &&
              "!top-0 !left-0 !m-0 !flex !h-dvh !w-screen !max-h-none !max-w-none !translate-x-0 !translate-y-0 !flex-col !rounded-none sm:!max-w-none",
            isMinimizedActive && "invisible pointer-events-none",
          )}
          onPointerDownOutside={(event) => {
            if (isMinimizedActive || isNestedPortalEvent(event.target)) {
              event.preventDefault();
            }
            onPointerDownOutside?.(event);
          }}
          onFocusOutside={(event) => {
            if (isMinimizedActive || isNestedPortalEvent(event.target)) {
              event.preventDefault();
            }
            onFocusOutside?.(event);
          }}
          onInteractOutside={(event) => {
            if (isMinimizedActive || isNestedPortalEvent(event.target)) {
              event.preventDefault();
            }
            onInteractOutside?.(event);
          }}
          onEscapeKeyDown={(event) => {
            if (isMinimizedActive) {
              event.preventDefault();
            }
            onEscapeKeyDown?.(event);
          }}
          {...props}
        >
          {showCloseButton ? (
            <div
              className={cn(
                DIALOG_CHROME_ACTIONS_CONTAINER_CLASS,
                isUnpaddedContent
                  ? "relative ml-auto shrink-0"
                  : DIALOG_CHROME_ACTIONS_PADDED_CLASS,
              )}
            >
              {canMinimize ? (
                <button
                  type="button"
                  className={DIALOG_CHROME_ACTION_BUTTON_CLASS}
                  aria-label={COPY_DIALOG_MINIMIZE_ACTION_LABEL}
                  onClick={minimizeDialog}
                >
                  <DialogMinimizeCircleIcon
                    className={DIALOG_CHROME_MINIMIZE_ICON_CLASS}
                  />
                  <span className="sr-only">
                    {COPY_DIALOG_MINIMIZE_ACTION_LABEL}
                  </span>
                </button>
              ) : null}
              {showMaximizeButton ? (
                <button
                  type="button"
                  className={DIALOG_CHROME_ACTION_BUTTON_CLASS}
                  aria-label={maximizeActionLabel}
                  onClick={() => setIsMaximized((current) => !current)}
                >
                  <DialogSquareCircleIcon
                    className={DIALOG_CHROME_MAXIMIZE_ICON_CLASS}
                  />
                  <span className="sr-only">{maximizeActionLabel}</span>
                </button>
              ) : null}
              <DialogPrimitive.Close
                data-slot="dialog-close"
                className={DIALOG_CHROME_ACTION_BUTTON_CLASS}
              >
                <CircleX className={DIALOG_CHROME_CLOSE_ICON_CLASS} />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          ) : null}
          {children}
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 pr-14", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-6 -mb-6 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      ) : null}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("type-section", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "type-muted *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
