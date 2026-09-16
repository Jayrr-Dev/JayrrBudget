"use client";

import { PersistentNoteFab } from "@/components/layout/PersistentNoteFab";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { clearPendingPasscode } from "@/crypto/pendingPasscode";
import { lockVault } from "@/crypto/session";
import { WarmSaasQueries } from "@/domains/dashboard/ui/WarmSaasQueries";
import { clearLedgerQuerySnapshots } from "@/domains/dashboard/ui/ledgerQuerySnapshot";
import type { AppModuleRecord } from "@/domains/modules/domain/types";
import { resolveModuleIcon } from "@/domains/modules/ui/moduleIcons";
import {
  useVaultPageLocked,
  VaultLockedGate,
} from "@/domains/vault/ui/VaultLockedGate";
import { cn } from "@/lib/utils";
import { budgetBrandLabel } from "@/shared/lib/budget-brand";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import { IconLogout, IconUser } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useConvexAuth, useQuery } from "convex/react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

function useBrandLabel() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  return budgetBrandLabel(me?.name);
}

function Brand({ label }: { label: string }) {
  const { open, animate } = useSidebar();
  const showLabel = !animate || open;

  return (
    <Link
      href="/"
      className={cn(
        "mb-2 flex items-center rounded-lg",
        showLabel
          ? "h-10 w-full gap-2 px-4"
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
          {label}
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
        "flex w-full flex-col gap-1 border-t border-[var(--sidebar-border)] pt-4",
        !showLabel && "items-center",
      )}
    >
      <SidebarLink
        active={isActivePath(pathname, "/profile")}
        link={{
          label: "Profile",
          href: "/profile",
          icon: <IconUser className="size-5 shrink-0 opacity-90" />,
        }}
      />
      <SignOutButton />
    </div>
  );
}

function SignOutButton() {
  const { signOut } = useAuthActions();
  const queryClient = useQueryClient();
  const { open, animate } = useSidebar();
  const showLabel = !animate || open;
  const [openConfirm, setOpenConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Popover open={openConfirm} onOpenChange={setOpenConfirm}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Sign out"
          className={cn(
            "group/sidebar relative flex items-center rounded-lg transition-colors",
            showLabel
              ? "h-10 w-full gap-2 px-4"
              : "size-10 shrink-0 justify-center self-center px-0",
            "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/70",
            openConfirm && "bg-[var(--sidebar-accent)]/70",
          )}
        >
          <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-5">
            <IconLogout className="size-5 shrink-0 opacity-90" />
          </span>
          {showLabel ? (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden text-sm font-medium whitespace-nowrap"
            >
              Sign out
            </motion.span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-56 gap-4 bg-surface-elevated p-4 text-foreground ring-border"
      >
        <PopoverHeader>
          <PopoverTitle>Sign out?</PopoverTitle>
          <PopoverDescription className="text-[var(--muted-foreground)]">
            You’ll need to sign in again to open your ledger.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setOpenConfirm(false)}
            className="rounded-md px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPending(true);
              clearPendingPasscode();
              lockVault();
              void signOut()
                .then(() => {
                  queryClient.clear();
                  clearLedgerQuerySnapshots();
                  window.location.assign("/sign-in");
                })
                .catch(() => setPending(false));
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
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
  const brandLabel = useBrandLabel();
  const { isAuthenticated } = useConvexAuth();
  const modulesList = useQuery(
    api.modules.list,
    isAuthenticated ? { enabledOnly: true } : "skip",
  );
  const modulesQuery = {
    data: modulesList ? { modules: modulesList } : undefined,
    isPending: modulesList === undefined,
  };
  const modules = modulesQuery.data?.modules ?? [];
  const navModules = modules;
  const vaultLocked = useVaultPageLocked();
  const fullBleedDatabase =
    !vaultLocked &&
    (pathname === "/database" || pathname.startsWith("/database/"));

  return (
    <div
      className={cn(
        "flex min-h-screen w-full flex-1 flex-col bg-[var(--background)] md:flex-row",
        fullBleedDatabase && "h-dvh max-h-dvh min-h-0 overflow-hidden",
        className,
      )}
    >
      <WarmSaasQueries />
      <Sidebar open={open} setOpen={setOpen} animate>
        <SidebarBody
          className="w-full justify-between gap-8"
          title={brandLabel}
        >
          <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden">
            <Brand label={brandLabel} />
            {modulesQuery.isPending ? (
              <ModulesLoading />
            ) : (
              <ModuleNav modules={navModules} />
            )}
          </div>
          <SidebarFooterLink />
        </SidebarBody>
      </Sidebar>
      <main className="flex max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
        <div
          className={cn(
            "mx-auto w-full max-w-[90rem] min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8",
            fullBleedDatabase &&
              "flex h-full max-h-full max-w-none flex-col overflow-hidden p-2 sm:p-3",
            vaultLocked && "flex flex-col",
            contentClassName,
          )}
        >
          <VaultLockedGate>{children}</VaultLockedGate>
        </div>
      </main>
      {vaultLocked ? null : <PersistentNoteFab />}
    </div>
  );
}
