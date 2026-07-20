import { createPlatformQueryClient } from "@tarodan/api-client/query";

// Tek paylaşılan QueryClient — _layout'taki provider ve logout temizliği
// (resetUserStores) aynı örneği kullansın diye modül seviyesinde.
export const queryClient = createPlatformQueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});
