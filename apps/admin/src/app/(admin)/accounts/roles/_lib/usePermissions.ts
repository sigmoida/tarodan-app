'use client';

import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { FALLBACK_DEFAULTS } from './constants';

/**
 * Role → permission list matrix (`['role-permissions']`). Used by both the matrix tab
 * (which seeds its editable copy from here) and the user assignments tab (permission count +
 * role preview); React Query shares it via the single queryKey. Falls back to defaults on load error.
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
