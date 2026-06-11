import { QueryClient } from '@tanstack/react-query';

// Tek paylaşılan QueryClient — _layout'taki provider ve logout temizliği
// (resetUserStores) aynı örneği kullansın diye modül seviyesinde.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});
