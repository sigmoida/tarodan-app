'use client';

import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { FALLBACK_DEFAULTS } from './constants';

/**
 * Rol → izin listesi matrisi (`['role-permissions']`). Hem matris sekmesi (düzenlenebilir
 * kopyayı buradan seed eder) hem de kullanıcı atamaları sekmesi (izin sayısı + rol önizleme)
 * kullanır; tek queryKey olduğu için React Query paylaşır. Yükleme hatasında varsayılana düşer.
 */
export function usePermissionsQuery() {
  return useQuery({
    queryKey: ['role-permissions'],
    queryFn: async () => {
      try {
        return ((await adminApi.getRolePermissions()).data ?? {}) as Record<string, string[]>;
      } catch {
        toast.error('İzin matrisi yüklenemedi');
        return FALLBACK_DEFAULTS as Record<string, string[]>;
      }
    },
  });
}
