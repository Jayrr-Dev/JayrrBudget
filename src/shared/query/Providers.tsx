"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ConvexClientProvider } from "@/shared/convex/ConvexClientProvider";
import { EnsureUserBootstrap } from "@/shared/convex/EnsureUserBootstrap";
import { ErrorBoundary } from "@/shared/errors/ErrorBoundary";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <ConvexClientProvider>
      <EnsureUserBootstrap>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>{children}</ErrorBoundary>
          <Toaster />
        </QueryClientProvider>
      </EnsureUserBootstrap>
    </ConvexClientProvider>
  );
}
