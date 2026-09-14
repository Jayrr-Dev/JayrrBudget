"use client";

import { PersistentNoteFab } from "@/components/layout/PersistentNoteFab";
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import type { AppModuleRecord } from "@/domains/modules/domain/types";
import { resolveModuleIcon } from "@/domains/modules/ui/moduleIcons";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

function Brand() {
  const { open, animate } = useSidebar();
  const showLabel = !animate || open;

  return (
    <Link
      href="/"
      className={cn(
        "mb-2 flex items-center rounded-lg",
        showLabel
          ? "h-10 w-full gap-3 px-2.5"
          : "size-10 shrink-0 justify-center self-center px-0",
      )}
    >
      <img
        src="/logo.svg"
        alt=""
        width={28}
        height={28}
        className="size-7 shrink-0"
      />
      {showLabel ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden text-sm font-semibold tracking-tight whitespace-nowrap text-[var(--sidebar-foreground)]"
        >
          JayrrBudget
        </motion.span>
      ) : null}
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ModuleNav({ modules }: { modules: AppModuleRecord[] }) {
  const pathname = usePathname();
  const { open, animate } = useSidebar();
  const showLabel = !animate || open;

  return (
    <nav
      className={cn(
        "flex w-full flex-1 flex-col gap-1 overflow-y-auto",
        showLabel ? "items-stretch" : "items-center",
      )}
    >
      {modules.map((mod) => {
        const Icon = resolveModuleIcon(mod.icon);
        return (
          <SidebarLink
            key={mod.slug}
            active={isActivePath(pathname, mod.href)}
            link={{
              label: mod.name,
              href: mod.href,
              icon: <Icon className="size-5 shrink-0 opacity-90" />,
            }}
          />
        );
      })}
    </nav>
  );
}

function ModulesLoading() {
  const { open, animate } = useSidebar();
  const showLabel = !animate || open;

  return (
    <div
      className={cn(
        "flex w-full flex-1 items-center gap-2 px-2.5 py-2 text-[var(--muted-foreground)]",
        showLabel ? "justify-start" : "justify-center px-0",
      )}
      role="status"
      aria-live="polite"
      aria-label="Loading modules"
    >
      <Spinner className="size-5 text-[var(--sidebar-foreground)] opacity-80" />
      {showLabel ? (
        <span className="text-xs whitespace-nowrap">Loading modules…</span>
      ) : null}
    </div>
  );
}

function SidebarFooterLink() {
  const pathname = usePathname();
  const { open, animate } = useSidebar();
  const showLabel = !animate || open;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 border-t border-[var(--sidebar-border)] pt-3",
        !showLabel && "items-center",
      )}
    >
      <SidebarLink
        active={isActivePath(pathname, "/modules")}
        link={{
          label: "Modules",
          href: "/modules",
          icon: (() => {
            const Icon = resolveModuleIcon("IconPuzzle");
            return <Icon className="size-5 shrink-0 opacity-90" />;
          })(),
        }}
      />
      <div
        className={cn(
          "flex items-center gap-2 px-2.5",
          !showLabel && "justify-center px-0",
        )}
      >
        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
        {showLabel ? (
          <span className="truncate text-xs text-[var(--muted-foreground)]">
            Account
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function AppShell({
  children,
  contentClassName,
  className,
}: {
  children: React.ReactNode;
  contentClassName?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const modulesList = useQuery(api.modules.list, { enabledOnly: true });
  const modulesQuery = {
    data: modulesList ? { modules: modulesList } : undefined,
    isPending: modulesList === undefined,
  };
  const modules = modulesQuery.data?.modules ?? [];
  const navModules = modules.filter((mod) => mod.slug !== "modules");
  const fullBleedDatabase =
    pathname === "/database" || pathname.startsWith("/database/");

  return (
    <div
      className={cn(
        "flex min-h-screen w-full flex-1 flex-col bg-[var(--background)] md:flex-row",
        fullBleedDatabase && "h-dvh max-h-dvh min-h-0 overflow-hidden",
        className,
      )}
    >
      <Sidebar open={open} setOpen={setOpen} animate>
        <SidebarBody className="w-full justify-between gap-8">
          <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden">
            <Brand />
            {modulesQuery.isPending ? (
              <ModulesLoading />
            ) : (
              <ModuleNav modules={navModules} />
            )}
          </div>
          <SidebarFooterLink />
        </SidebarBody>
      </Sidebar>
      <main className="flex max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "mx-auto w-full max-w-[90rem] min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8",
            fullBleedDatabase &&
              "flex h-full max-h-full max-w-none flex-col overflow-hidden p-2 sm:p-3",
            contentClassName,
          )}
        >
          {children}
        </div>
      </main>
      <PersistentNoteFab />
    </div>
  );
}
