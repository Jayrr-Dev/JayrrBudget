"use client";

import { PiggyIcon } from "@/components/ui/piggy-icon";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

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
        "sticky top-0 z-30 hidden h-screen max-w-[280px] shrink-0 overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--surface)] py-3 md:flex md:flex-col",
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

export const MobileSidebar = ({
  className,
  children,
  title = "Jayrr's Budget",
  headerActions,
  ...props
}: React.ComponentProps<"div"> & {
  title?: string;
  headerActions?: React.ReactNode;
}) => {
  const { open, setOpen } = useSidebar();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setOpen(false);
    }
  }, [pathname, setOpen]);

  const drawer = (
    <AnimatePresence>
      {open ? (
        <motion.button
          key="sidebar-backdrop"
          type="button"
          aria-label="Close menu backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}
      {open ? (
        <motion.div
          key="sidebar-drawer"
          initial={{ x: "-100%" }}
          animate={{
            x: 0,
            transition: { duration: 0.3, ease: "easeOut" },
          }}
          exit={{
            x: "-100%",
            transition: { duration: 0.45, ease: [0.32, 0.72, 0, 1] },
          }}
          className={cn(
            "fixed inset-y-0 left-0 z-[100] flex h-dvh w-[min(100%,20rem)] flex-col justify-between overflow-y-auto border-r border-[var(--sidebar-border)] bg-[var(--surface)] p-6 shadow-xl md:hidden",
            className,
          )}
        >
          <button
            type="button"
            aria-label="Close menu"
            className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-lg text-[var(--foreground)] hover:bg-[var(--sidebar-accent)]"
            onClick={() => setOpen(false)}
          >
            <PiggyIcon name="close" />
          </button>
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div
      className="relative z-40 flex w-full items-center justify-between border-b border-[var(--sidebar-border)] bg-[var(--surface)] px-4 py-2 md:hidden"
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        <img
          src="/icon.svg?v=public"
          alt=""
          width={28}
          height={28}
          className="size-7 shrink-0"
        />
        <p className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">
          {title}
        </p>
      </div>
      <div className="flex h-11 shrink-0 items-center">
        {headerActions}
        {headerActions ? (
          <Separator
            orientation="vertical"
            className="mx-1.5 h-5 self-center bg-[var(--sidebar-border)]"
          />
        ) : null}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex size-11 items-center justify-center rounded-lg text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]"
          onClick={() => setOpen(!open)}
        >
          <PiggyIcon name="menu" />
        </button>
      </div>
      {mounted && isMobile ? createPortal(drawer, document.body) : null}
    </div>
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
