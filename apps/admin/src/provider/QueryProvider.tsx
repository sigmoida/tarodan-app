"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * React-query QueryClient provider — mounted in (admin)/layout.tsx.
 * useState avoids creating a new instance on every render.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,          // fresh for 30s; avoids unnecessary refetches
            refetchOnWindowFocus: false, // no refetch on tab switch in the admin panel
            retry: 1,                    // error → one more attempt; then toast
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
