"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

export type MinimizedDialogEntry = {
  id: string;
  label: string;
  restore: () => void;
  requestClose: () => void;
};

type MinimizedDialogsContextValue = {
  entries: readonly MinimizedDialogEntry[];
  register: (entry: MinimizedDialogEntry) => void;
  unregister: (id: string) => void;
};

const MinimizedDialogsContext =
  React.createContext<MinimizedDialogsContextValue | null>(null);

export function useMinimizedDialogsRegistry() {
  return React.useContext(MinimizedDialogsContext);
}

export function ProvidesMinimizedDialogs({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [entries, setEntries] = React.useState<MinimizedDialogEntry[]>([]);
  const entriesRef = React.useRef<MinimizedDialogEntry[]>([]);
  entriesRef.current = entries;
  const previousPathnameRef = React.useRef(pathname);

  const register = React.useCallback((entry: MinimizedDialogEntry) => {
    setEntries((current) => {
      const withoutEntry = current.filter((existing) => existing.id !== entry.id);
      return [...withoutEntry, entry];
    });
  }, []);

  const unregister = React.useCallback((id: string) => {
    setEntries((current) => current.filter((existing) => existing.id !== id));
  }, []);

  React.useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }
    previousPathnameRef.current = pathname;
    for (const entry of entriesRef.current) {
      entry.requestClose();
    }
    setEntries([]);
  }, [pathname]);

  const contextValue = React.useMemo(
    (): MinimizedDialogsContextValue => ({ entries, register, unregister }),
    [entries, register, unregister],
  );

  return (
    <MinimizedDialogsContext.Provider value={contextValue}>
      {children}
    </MinimizedDialogsContext.Provider>
  );
}
