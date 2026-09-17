"use client";

import { PersistentNoteFab } from "@/components/layout/PersistentNoteFab";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PiggyIcon } from "@/components/ui/piggy-icon";
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
import { usePrefetchAnalysis } from "@/domains/analysis/queries/useAnalysisQuery";
import { WarmSaasQueries } from "@/domains/dashboard/ui/WarmSaasQueries";
import {
  clearLastView,
  peekEncryptedLedgerLocal,
  readLastUserId,
  readLastView,
  rememberEncryptedLedgerLocal,
  upsertLastView,
  writeLastUserId,
} from "@/domains/dashboard/ui/lastViewCache";
import {
  getLedgerSnapshotVersion,
  markLastViewHydrateDone,
  peekLastViewSavedAt,
  peekModules,
  rememberDashboard,
  rememberLastViewSavedAt,
  rememberModules,
  subscribeLedgerSnapshots,
} from "@/domains/dashboard/ui/ledgerQuerySnapshot";
import { useFeatureFlags } from "@/domains/feature-flags/ui/useFeatureFlag";
import { PiggyMascot } from "@/domains/ledger-ai/ui/PiggyMascot";
import type { AppModuleRecord } from "@/domains/modules/domain/types";
import { resolveModuleIcon } from "@/domains/modules/ui/moduleIcons";
import { TrackingUsageHeartbeat } from "@/domains/user-metrics/ui/TrackingUsageHeartbeat";
import {
  useVaultPageLocked,
  VaultLockedGate,
} from "@/domains/vault/ui/VaultLockedGate";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { budgetBrandLabel } from "@/shared/lib/budget-brand";
import { useSignOut } from "@/shared/convex/EnsureUserBootstrap";
import { useConnectionState } from "@/shared/offline/useConnectionState";
import { api } from "@convex/_generated/api";
import { useQueryClient } from "@tanstack/react-query";
import { useConvexAuth, useQuery } from "convex/react";
import { ChevronDown, Info } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";

const ADMIN_MODULE_SLUGS = new Set([
  "database",
  "modules",
  "revenue",
  "service",
  "users",
]);

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
        "mb-1 flex items-center rounded-lg",
        showLabel
          ? "h-10 w-full gap-2.5 px-2.5"
          : "size-10 shrink-0 justify-center self-center px-0",
      )}
    >
      <img
        src="/icon.svg?v=public"
        alt=""
        width={28}
        height={28}
        className="size-8 shrink-0"
      />
      {showLabel ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden text-base font-semibold tracking-tight whitespace-nowrap text-[var(--sidebar-foreground)]"
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

function ModuleNavLink({
  mod,
  forceLabel = false,
}: {
  mod: AppModuleRecord;
  forceLabel?: boolean;
}) {
  const pathname = usePathname();
  const prefetchAnalysis = usePrefetchAnalysis();
  const Icon = resolveModuleIcon(mod.icon);

  return (
    <SidebarLink
      active={isActivePath(pathname, mod.href)}
      forceLabel={forceLabel}
      onMouseEnter={mod.href === "/analysis" ? prefetchAnalysis : undefined}
      onFocus={mod.href === "/analysis" ? prefetchAnalysis : undefined}
      link={{
        label: mod.name,
        href: mod.href,
        icon: <Icon className="size-6 shrink-0 opacity-90" />,
      }}
    />
  );
}

function AdminModuleSection({ modules }: { modules: AppModuleRecord[] }) {
  const pathname = usePathname();
  const { open, animate } = useSidebar();
  const showLabel = !animate || open;
  const adminActive = modules.some((mod) => isActivePath(pathname, mod.href));
  const [expanded, setExpanded] = useState(adminActive);

  if (modules.length === 0) {
    return null;
  }

  const triggerClassName = cn(
    "group/sidebar relative flex items-center rounded-lg transition-colors",
    showLabel
      ? "h-10 w-full gap-2.5 px-2.5 max-md:min-h-11"
      : "size-10 shrink-0 justify-center self-center px-0",
    adminActive
      ? "bg-primary-subtle font-medium text-primary-subtle-foreground"
      : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/70",
  );

  if (!showLabel) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Admin"
            aria-label="Admin"
            className={triggerClassName}
          >
            <span className="flex size-6 shrink-0 items-center justify-center [&_svg]:size-6">
              <PiggyIcon name="service" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-48 gap-0.5 bg-surface-elevated p-2 text-foreground ring-border"
        >
          <p className="px-2.5 pb-1 text-xs font-medium text-[var(--muted-foreground)]">
            Admin
          </p>
          {modules.map((mod) => (
            <ModuleNavLink key={mod.slug} mod={mod} forceLabel />
          ))}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className={triggerClassName} aria-label="Admin">
        <span className="flex size-6 shrink-0 items-center justify-center [&_svg]:size-6">
          <PiggyIcon name="service" />
        </span>
        <span className="flex-1 overflow-hidden text-left text-base font-medium whitespace-nowrap">
          Admin
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 opacity-70 transition-transform",
            expanded ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-0.5 pt-0.5 pl-2">
        {modules.map((mod) => (
          <ModuleNavLink key={mod.slug} mod={mod} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ModuleNav({ modules }: { modules: AppModuleRecord[] }) {
  const { open, animate } = useSidebar();
  const showLabel = !animate || open;
  const mainModules = modules.filter(
    (mod) => !ADMIN_MODULE_SLUGS.has(mod.slug),
  );
  const adminModules = modules.filter((mod) =>
    ADMIN_MODULE_SLUGS.has(mod.slug),
  );

  return (
    <nav
      className={cn(
        "flex w-full min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-none",
        showLabel ? "items-stretch" : "items-center",
      )}
    >
      {mainModules.map((mod) => (
        <ModuleNavLink key={mod.slug} mod={mod} />
      ))}
      <AdminModuleSection modules={adminModules} />
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
      <PiggyMascot
        mood="thinking"
        iconClassName="size-6"
        className="text-[var(--sidebar-foreground)]"
      />
      {showLabel ? (
        <span className="text-xs whitespace-nowrap">Thinking</span>
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
        "flex w-full flex-col gap-0.5 border-t border-[var(--sidebar-border)] pt-2",
        showLabel ? "items-stretch" : "items-center",
      )}
    >
      <SidebarLink
        active={isActivePath(pathname, "/profile")}
        link={{
          label: "Profile",
          href: "/profile",
          icon: <PiggyIcon name="profile" />,
        }}
      />
      <SignOutButton />
    </div>
  );
}

function SignOutButton() {
  const signOut = useSignOut();
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
              ? "h-10 w-full gap-2.5 px-2.5 max-md:min-h-11"
              : "size-10 shrink-0 justify-center self-center px-0",
            "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/70",
            openConfirm ? "bg-[var(--sidebar-accent)]/70" : "",
          )}
        >
          <span className="flex size-6 shrink-0 items-center justify-center [&_svg]:size-6">
            <PiggyIcon name="logout" />
          </span>
          {showLabel ? (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden text-base font-medium whitespace-nowrap"
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
            You’ll need to sign in again to open your budget.
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
              void signOut()
                .then(() => {
                  queryClient.clear();
                  window.location.assign("/sign-in");
                })
                .catch(() => {
                  queryClient.clear();
                  window.location.assign("/sign-in");
                });
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

function formatLastViewSavedAt(savedAt: number) {
  return new Date(savedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function OfflineLastViewBanner({ savedAt }: { savedAt: number | undefined }) {
  const when = savedAt ? formatLastViewSavedAt(savedAt) : null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-[var(--border)] bg-surface-elevated px-4 py-2 text-sm text-foreground"
    >
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 font-medium">
          Offline
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                aria-label="About offline view"
              >
                <Info className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={8}
              className="w-80 gap-0 p-3.5"
            >
              <PopoverHeader className="gap-1.5">
                <PopoverTitle>Last loaded view</PopoverTitle>
                <PopoverDescription>
                  This is the dashboard and sidebar from the last time the app
                  loaded while you were online.
                </PopoverDescription>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                  <li>You can still browse Overview, Accounts, and Transactions</li>
                  <li>Uploads and edits wait until you are connected</li>
                </ul>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </span>
        <span className="text-muted-foreground">
          {when
            ? `Showing data from ${when}. Changes need a connection.`
            : "Changes need a connection."}
        </span>
      </p>
      <span className="sr-only">
        Showing saved data. You cannot make changes until you reconnect.
      </span>
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
  const brandLabel = useBrandLabel();
  const { isAuthenticated } = useConvexAuth();
  const { isOffline } = useConnectionState();
  const flags = useFeatureFlags();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  useSyncExternalStore(
    subscribeLedgerSnapshots,
    getLedgerSnapshotVersion,
    getLedgerSnapshotVersion,
  );
  const modulesList = useQuery(
    api.modules.list,
    isAuthenticated ? { enabledOnly: true } : "skip",
  );

  useLayoutEffect(() => {
    let cancelled = false;
    void (async () => {
      if (peekEncryptedLedgerLocal()) {
        if (!cancelled) markLastViewHydrateDone();
        return;
      }
      const userId = readLastUserId();
      if (!userId) {
        if (!cancelled) markLastViewHydrateDone();
        return;
      }
      const record = await readLastView(userId);
      if (cancelled) return;
      if (record) {
        if (record.dashboard) rememberDashboard(250, record.dashboard);
        if (record.modules) rememberModules(record.modules);
        rememberLastViewSavedAt(record.savedAt);
      }
      markLastViewHydrateDone();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !me?.userId) return;
    writeLastUserId(me.userId);
    if (flags.loading) return;
    rememberEncryptedLedgerLocal(flags.encryptedLedger);
    if (flags.encryptedLedger) {
      void clearLastView(me.userId);
      return;
    }
    if (!modulesList) return;
    rememberModules(modulesList);
    void upsertLastView({ userId: me.userId, modules: modulesList });
  }, [
    flags.encryptedLedger,
    flags.loading,
    isAuthenticated,
    me?.userId,
    modulesList,
  ]);

  const cachedModules = peekModules();
  const modulesQuery = {
    data:
      modulesList !== undefined
        ? { modules: modulesList }
        : cachedModules
          ? { modules: cachedModules }
          : undefined,
    isPending: modulesList === undefined && cachedModules === undefined,
  };
  const modules = modulesQuery.data?.modules ?? [];
  const navModules = modules;
  const vaultLocked = useVaultPageLocked();
  const isMobile = useIsMobile();
  const workspaceTools = vaultLocked ? null : (
    <PersistentNoteFab placement={isMobile ? "navbar" : "floating"} />
  );
  const fullBleedDatabase =
    !vaultLocked &&
    (pathname === "/database" || pathname.startsWith("/database/"));
  const lastViewSavedAt = peekLastViewSavedAt();

  return (
    <div
      className={cn(
        "flex min-h-screen w-full flex-1 flex-col bg-[var(--background)] pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:flex-row",
        fullBleedDatabase && "h-dvh max-h-dvh min-h-0 overflow-hidden",
        className,
      )}
    >
      <WarmSaasQueries />
      <TrackingUsageHeartbeat />
      <Sidebar open={open} setOpen={setOpen} animate>
        <SidebarBody
          className="justify-between gap-3"
          title={brandLabel}
          headerActions={isMobile ? workspaceTools : undefined}
        >
          <div className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden">
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
        {isOffline ? <OfflineLastViewBanner savedAt={lastViewSavedAt} /> : null}
        <div
          className={cn(
            "mx-auto w-full max-w-[90rem] min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-8 sm:py-8 [-webkit-overflow-scrolling:touch]",
            fullBleedDatabase &&
              "flex h-full max-h-full max-w-none flex-col overflow-hidden p-2 sm:p-3",
            vaultLocked && "flex flex-col",
            contentClassName,
          )}
        >
          <VaultLockedGate>{children}</VaultLockedGate>
        </div>
      </main>
      {isMobile ? null : workspaceTools}
    </div>
  );
}
