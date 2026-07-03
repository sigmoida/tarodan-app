"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * React-query QueryClient provider'ı — (admin)/layout.tsx'te mount edilir.
 * useState ile her render'da yeni instance oluşturmaktan kaçınıyoruz.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,          // 30 saniye taze; gereksiz refetch önlenir
            refetchOnWindowFocus: false, // Admin panelde sekme geçişinde refetch istemiyoruz
            retry: 1,                    // Hata → 1 deneme daha; sonra toast
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
