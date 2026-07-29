"use client";

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { extractErrorMessage } from "@/lib/error";
import { adminKeys } from "@/lib/query/keys";

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
  /** Immediately patch matching resource caches and restore them if the request fails. */
  optimistic?: {
    resources: string | string[];
    id: (vars: TVars) => string;
    patch: (vars: TVars) => Record<string, unknown>;
  };
  mutation?: Omit<
    UseMutationOptions<TData, unknown, TVars>,
    "mutationFn" | "onSuccess" | "onError"
  >;
}

interface AdminMutationContext {
  snapshots: Array<[QueryKey, unknown]>;
  userContext?: unknown;
}

/** Patch an entity wherever it appears in a cached API payload. */
function patchCachedEntity(
  value: unknown,
  id: string,
  patch: Record<string, unknown>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => patchCachedEntity(item, id, patch));
  }
  if (!value || typeof value !== "object" || value instanceof Date)
    return value;

  const record = value as Record<string, unknown>;
  const source = record.id === id ? { ...record, ...patch } : record;
  let changed = source !== record;
  const next: Record<string, unknown> = { ...source };

  for (const [key, child] of Object.entries(source)) {
    if (!child || typeof child !== "object") continue;
    const patched = patchCachedEntity(child, id, patch);
    if (patched !== child) {
      next[key] = patched;
      changed = true;
    }
  }

  return changed ? next : value;
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
    optimistic,
    mutation,
  } = options;
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVars, AdminMutationContext>({
    ...mutation,
    mutationFn,
    onMutate: async (vars, mutationContext) => {
      const userContext = await mutation?.onMutate?.(vars, mutationContext);
      if (!optimistic) return { snapshots: [], userContext };

      const resources = Array.isArray(optimistic.resources)
        ? optimistic.resources
        : [optimistic.resources];
      await Promise.all(
        resources.map((resource) =>
          queryClient.cancelQueries({ queryKey: adminKeys.all(resource) }),
        ),
      );

      const snapshots = resources.flatMap((resource) =>
        queryClient.getQueriesData({ queryKey: adminKeys.all(resource) }),
      );
      const id = optimistic.id(vars);
      const patch = optimistic.patch(vars);
      snapshots.forEach(([queryKey, cached]) => {
        queryClient.setQueryData(
          queryKey,
          patchCachedEntity(cached, id, patch),
        );
      });

      return { snapshots, userContext };
    },
    onSuccess: (data, vars) => {
      invalidates.forEach((resource) =>
        queryClient.invalidateQueries({ queryKey: adminKeys.all(resource) }),
      );
      if (successMessage) toast.success(successMessage);
      onSuccess?.(data, vars);
    },
    onError: (error, _vars, context) => {
      context?.snapshots.forEach(([queryKey, cached]) => {
        queryClient.setQueryData(queryKey, cached);
      });
      if (showErrorToast) toast.error(extractErrorMessage(error, errorMessage));
    },
    onSettled: (data, error, vars, context, mutationContext) =>
      mutation?.onSettled?.(
        data,
        error,
        vars,
        context?.userContext,
        mutationContext,
      ),
  });
}
