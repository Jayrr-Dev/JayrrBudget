"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import React, { useEffect, useRef, useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconX } from "@tabler/icons-react";

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
  ...props
}: React.ComponentProps<typeof motion.div> & { title?: string }) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar
        title={title}
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

  return (
    <motion.aside
      ref={rootRef}
      className={cn(
        "sticky top-0 z-30 hidden h-screen shrink-0 overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--surface)] py-5 md:flex md:flex-col",
        open || !animate ? "px-3" : "items-center px-0",
        className,
      )}
      initial={false}
      animate={{
        width: animate ? (open ? 260 : 56) : 260,
      }}
      transition={{
        duration: open ? 0.25 : 0.45,
        ease: open ? "easeOut" : [0.32, 0.72, 0, 1],
      }}
      {...props}
      onPointerEnter={keepOpen}
      onPointerLeave={(event) => scheduleClose(event.relatedTarget)}
    >
      {children}
    </motion.aside>
  );
};

export const MobileSidebar = ({
  className,
  children,
  title = "Jayrr's Budget",
  ...props
}: React.ComponentProps<"div"> & { title?: string }) => {
  const { open, setOpen } = useSidebar();
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between border-b border-[var(--sidebar-border)] bg-[var(--surface)] px-4 py-3 md:hidden",
      )}
      {...props}
    >
      <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
      <button
        type="button"
        aria-label="Open menu"
        className="rounded-lg p-1.5 text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]"
        onClick={() => setOpen(!open)}
      >
        <IconMenu2 className="size-5" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ x: "-100%", opacity: 0 }}
            animate={{
              x: 0,
              opacity: 1,
              transition: { duration: 0.3, ease: "easeOut" },
            }}
            exit={{
              x: "-100%",
              opacity: 0,
              transition: { duration: 0.45, ease: [0.32, 0.72, 0, 1] },
            }}
            className={cn(
              "fixed inset-0 z-[100] flex h-full w-[min(100%,20rem)] flex-col justify-between border-r border-[var(--sidebar-border)] bg-[var(--surface)] p-6 shadow-xl",
              className,
            )}
          >
            <button
              type="button"
              aria-label="Close menu"
              className="absolute top-4 right-4 rounded-lg p-1.5 text-[var(--foreground)] hover:bg-[var(--sidebar-accent)]"
              onClick={() => setOpen(false)}
            >
              <IconX className="size-5" />
            </button>
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {open ? (
        <button
          type="button"
          aria-label="Close menu backdrop"
          className="fixed inset-0 z-[90] bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
};

export const SidebarLink = ({
  link,
  className,
  active = false,
  ...props
}: {
  link: SidebarLinkItem;
  className?: string;
  active?: boolean;
} & Omit<React.ComponentProps<typeof Link>, "href">) => {
  const { open, animate } = useSidebar();
  const showLabel = !animate || open;

  return (
    <Link
      href={link.href}
      title={link.label}
      className={cn(
        "group/sidebar relative flex items-center rounded-lg transition-colors",
        showLabel
          ? "h-10 w-full gap-2 px-4"
          : "size-10 shrink-0 justify-center self-center px-0",
        active
          ? "bg-primary-subtle font-medium text-primary-subtle-foreground"
          : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/70",
        className,
      )}
      {...props}
    >
      <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-5">
        {link.icon}
      </span>
      {showLabel ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden text-sm font-medium whitespace-nowrap"
        >
          {link.label}
        </motion.span>
      ) : null}
    </Link>
  );
};
