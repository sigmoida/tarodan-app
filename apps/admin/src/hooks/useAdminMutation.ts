"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { extractErrorMessage } from "@/lib/error";

export interface UseAdminMutationOptions<TData, TVars> {
  /**
   * Resource names whose queries refresh on success. Each entry invalidates
   * EVERY query of that resource (all lists + details) — so a list re-fetches
   * automatically after an action, no manual refetch().
   */
  invalidates?: string[];
  successMessage?: string;
  errorMessage?: string;
  /** Show the shared error toast on failure. Disable when the caller renders the error inline. */
  showErrorToast?: boolean;
  onSuccess?: (data: TData, vars: TVars) => void;
  mutation?: Omit<
    UseMutationOptions<TData, unknown, TVars>,
    "mutationFn" | "onSuccess" | "onError"
  >;
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
    errorMessage = t("common.operationFailed"),
    showErrorToast = true,
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
      if (showErrorToast) toast.error(extractErrorMessage(error, errorMessage));
    },
  });
}
