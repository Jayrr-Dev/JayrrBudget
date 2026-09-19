"use client";

import { PiggyIcon } from "@/components/ui/piggy-icon";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface SidebarLinkItem {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined,
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(true);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = ({
  title,
  headerActions,
  ...props
}: React.ComponentProps<typeof motion.div> & {
  title?: string;
  headerActions?: React.ReactNode;
}) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar
        title={title}
        headerActions={headerActions}
        {...(props as React.ComponentProps<"div">)}
      />
    </>
  );
};

function pointerStillInSidebar(
  root: HTMLElement | null,
  target: EventTarget | null,
) {
  if (!root) return false;
  if (target instanceof Node && root.contains(target)) return true;
  if (target instanceof Element) {
    if (target.closest("[data-radix-popper-content-wrapper]")) return true;
    if (target.closest("[data-slot='popover-content']")) return true;
  }
  return root.matches(":hover");
}

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  const rootRef = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<number>(0);

  useEffect(() => {
    return () => window.clearTimeout(closeTimer.current);
  }, []);

  const keepOpen = () => {
    window.clearTimeout(closeTimer.current);
    if (animate) setOpen(true);
  };

  const scheduleClose = (target: EventTarget | null) => {
    if (!animate) return;
    if (pointerStillInSidebar(rootRef.current, target)) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (pointerStillInSidebar(rootRef.current, null)) return;
      setOpen(false);
    }, 220);
  };

  const expanded = open || !animate;
  const railWidth = expanded ? 280 : 64;

  return (
    <motion.aside
      ref={rootRef}
      className={cn(
        "z-30 hidden h-full min-h-0 max-w-[280px] shrink-0 overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--surface)] py-3 md:flex md:flex-col",
        className,
        expanded ? "w-[280px] px-3" : "w-16 items-center px-0",
      )}
      initial={false}
      {...props}
      animate={{ width: railWidth }}
      transition={{
        duration: open ? 0.25 : 0.45,
        ease: open ? "easeOut" : [0.32, 0.72, 0, 1],
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        keepOpen();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        scheduleClose(event.relatedTarget);
      }}
    >
      {children}
    </motion.aside>
  );
};

function MobileBrandMark({ title }: { title: string }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [showName, setShowName] = useState(true);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const measure = measureRef.current;
    if (!slot || !measure) return;

    const sync = () => {
      setShowName(measure.scrollWidth <= slot.clientWidth + 1);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(slot);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [title]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" title={title}>
      <img
        src="/icon.svg?v=public"
        alt={showName ? "" : title}
        width={28}
        height={28}
        className="size-7 shrink-0"
      />
      <div ref={slotRef} className="relative min-h-5 min-w-0 flex-1">
        <span
          ref={measureRef}
          aria-hidden
          className="invisible absolute top-0 left-0 whitespace-nowrap text-sm font-semibold"
        >
          {title}
        </span>
        {showName ? (
          <p className="text-sm font-semibold whitespace-nowrap text-[var(--foreground)]">
            {title}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export const MobileSidebar = ({
  className,
  children,
  title = "Jev's Budget",
  headerActions,
  ...props
}: React.ComponentProps<"div"> & {
  title?: string;
  headerActions?: React.ReactNode;
}) => {
  const { open, setOpen } = useSidebar();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setOpen(false);
    }
  }, [pathname, setOpen]);

  const drawer = (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none md:hidden" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-[100] flex w-[min(100%,20rem)] flex-col justify-between overflow-y-auto overscroll-contain border-r border-[var(--sidebar-border)] bg-[var(--surface)] p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] shadow-xl outline-none duration-300 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left motion-reduce:animate-none md:hidden",
          className,
        )}
      >
        <DialogPrimitive.Title className="sr-only">
          Navigation menu
        </DialogPrimitive.Title>
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            aria-label="Close menu"
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex size-11 items-center justify-center rounded-lg text-[var(--foreground)] hover:bg-[var(--sidebar-accent)]"
          >
            <PiggyIcon name="close" />
          </button>
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );

  return (
    <DialogPrimitive.Root open={isMobile && open} onOpenChange={setOpen}>
      <div
        className="relative z-40 flex w-full shrink-0 items-center justify-between border-b border-[var(--sidebar-border)] bg-[var(--surface)] px-4 py-2 md:hidden"
        {...props}
      >
        <MobileBrandMark title={title} />
        <div className="flex h-11 shrink-0 items-center">
          {headerActions}
          {headerActions ? (
            <Separator
              orientation="vertical"
              className="mx-1.5 h-4 self-center bg-[var(--sidebar-border)] data-vertical:h-4 data-vertical:self-center"
            />
          ) : null}
          <DialogPrimitive.Trigger asChild>
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              className="flex size-11 items-center justify-center rounded-lg text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]"
            >
              <PiggyIcon name="menu" />
            </button>
          </DialogPrimitive.Trigger>
        </div>
        {isMobile ? drawer : null}
      </div>
    </DialogPrimitive.Root>
  );
};

export const SidebarLink = ({
  link,
  className,
  active = false,
  forceLabel = false,
  onClick,
  ...props
}: {
  link: SidebarLinkItem;
  className?: string;
  active?: boolean;
  forceLabel?: boolean;
} & Omit<React.ComponentProps<typeof Link>, "href">) => {
  const { open, setOpen, animate } = useSidebar();
  const showLabel = forceLabel || !animate || open;

  return (
    <Link
      href={link.href}
      title={link.label}
      className={cn(
        "group/sidebar relative flex touch-manipulation items-center rounded-lg transition-colors",
        showLabel
          ? "h-10 w-full gap-2.5 px-2.5 max-md:min-h-11"
          : "size-10 shrink-0 justify-center self-center px-0",
        active
          ? "bg-primary-subtle font-medium text-primary-subtle-foreground"
          : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/70",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (window.matchMedia("(max-width: 767px)").matches) {
          setOpen(false);
        }
      }}
      {...props}
    >
      <span className="flex size-6 shrink-0 items-center justify-center [&_svg]:size-6">
        {link.icon}
      </span>
      {showLabel ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden text-base font-medium whitespace-nowrap"
        >
          {link.label}
        </motion.span>
      ) : null}
    </Link>
  );
};
