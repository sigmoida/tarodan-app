"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createPlatformQueryClient } from "@tarodan/api-client/query";

/**
 * React-query QueryClient provider — mounted in (admin)/layout.tsx.
 * useState avoids creating a new instance on every render.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createPlatformQueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
