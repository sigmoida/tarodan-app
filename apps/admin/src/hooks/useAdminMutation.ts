'use client';

import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';

export interface UseAdminMutationOptions<TData, TVars> {
  /**
   * Resource names whose queries refresh on success. Each entry invalidates
   * EVERY query of that resource (all lists + details) — so a list re-fetches
   * automatically after an action, no manual refetch().
   */
  invalidates?: string[];
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: TData, vars: TVars) => void;
  mutation?: Omit<
    UseMutationOptions<TData, unknown, TVars>,
    'mutationFn' | 'onSuccess' | 'onError'
  >;
}

function apiErrorMessage(error: unknown): string | undefined {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  return undefined;
}

/**
 * The single way admin pages perform writes. Wraps useMutation with the shared
 * success/error toast and cache invalidation.
 */
export function useAdminMutation<TData, TVars = void>(
  mutationFn: (vars: TVars) => Promise<TData>,
  options: UseAdminMutationOptions<TData, TVars> = {},
) {
  const t = useTranslations();
  const {
    invalidates = [],
    successMessage,
    errorMessage = t('common.operationFailed'),
    onSuccess,
    mutation,
  } = options;
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVars>({
    ...mutation,
    mutationFn,
    onSuccess: (data, vars) => {
      invalidates.forEach((resource) =>
        queryClient.invalidateQueries({ queryKey: [resource] }),
      );
      if (successMessage) toast.success(successMessage);
      onSuccess?.(data, vars);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error) ?? errorMessage);
    },
  });
}
