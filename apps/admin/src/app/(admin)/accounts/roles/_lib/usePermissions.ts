'use client';

import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { adminApi } from '@/lib/api';
import { FALLBACK_DEFAULTS } from './constants';

/**
 * Role → permission list matrix (`['role-permissions']`). Used by both the matrix tab
 * (which seeds its editable copy from here) and the user assignments tab (permission count +
 * role preview); React Query shares it via the single queryKey. Falls back to defaults on load error.
 */
export function usePermissionsQuery() {
  const t = useTranslations();
  return useQuery({
    queryKey: ['role-permissions'],
    queryFn: async () => {
      try {
        return ((await adminApi.getRolePermissions()).data ?? {}) as Record<string, string[]>;
      } catch {
        toast.error(t('admin.roles.matrixLoadError'));
        return FALLBACK_DEFAULTS as Record<string, string[]>;
      }
    },
  });
}
