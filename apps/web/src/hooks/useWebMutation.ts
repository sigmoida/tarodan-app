"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { isCancellation } from "@/lib/query/client";

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
  /** Suppresses the error toast (for background writes the user did not start). */
  silentError?: boolean;
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

/** The API's machine-readable `errorCode` off an axios error, if any. */
export function apiErrorCode(error: unknown): string | undefined {
  const code = (error as { response?: { data?: { errorCode?: unknown } } })
    ?.response?.data?.errorCode;
  return typeof code === "string" ? code : undefined;
}

/**
 * The catalog key of a localized API error (`i18nKey`, e.g.
 * `server.product.boostConsentRequired`), if any: the stable way to tell one
 * rejection from another, since `message` is already translated.
 */
export function apiErrorI18nKey(error: unknown): string | undefined {
  const key = (error as { response?: { data?: { i18nKey?: unknown } } })
    ?.response?.data?.i18nKey;
  return typeof key === "string" ? key : undefined;
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
    errorMessage,
    silentError = false,
    onSuccess,
    mutation,
  }: UseWebMutationOptions<TData, TVars> = {},
) {
  const t = useTranslations();
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
    // The Sentry report is NOT here: the `MutationCache` (lib/query/client)
    // reports every mutation error, even one with its own `onError`. Only the
    // user-facing toast lives here; `silentError` does not stop the report.
    onError: (error) => {
      if (silentError || isCancellation(error)) return;
      toast.error(
        apiErrorMessage(error) ?? errorMessage ?? t("common.operationFailed"),
      );
    },
  });
}
