"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import toast from "react-hot-toast";

export interface UseWebMutationOptions<TData, TVars> {
  /**
   * Resource names whose queries refresh on success. Each entry invalidates
   * EVERY query of that resource (all lists + details), so a list re-fetches
   * automatically after a write — no manual refetch(). Use the same resource
   * name the list/detail hooks key on (see `webKeys`).
   */
  invalidates?: string[];
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: TData, vars: TVars) => void;
  mutation?: Omit<
    UseMutationOptions<TData, unknown, TVars>,
    "mutationFn" | "onSuccess" | "onError"
  >;
}

/** Pull an API error message (may be a string or a string[]) off an axios error. */
export function apiErrorMessage(error: unknown): string | undefined {
  const message = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && typeof message[0] === "string")
    return message[0];
  return undefined;
}

/**
 * The web analogue of admin's `useAdminMutation` — the one way account-area
 * pages should perform writes. Wraps `useMutation` with the shared success/error
 * toast and resource invalidation, so the ~85 hand-rolled mutation hooks stop
 * re-implementing toast + `invalidateQueries` + `err?.response?.data?.message`.
 *
 * Pass localized copy from the caller (it has the `t()`):
 *   useWebMutation((v) => addressesApi.create(v), {
 *     invalidates: ['addresses'], successMessage: t('address.added'),
 *   })
 */
export function useWebMutation<TData, TVars = void>(
  mutationFn: (vars: TVars) => Promise<TData>,
  {
    invalidates = [],
    successMessage,
    errorMessage = "İşlem başarısız",
    onSuccess,
    mutation,
  }: UseWebMutationOptions<TData, TVars> = {},
) {
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
