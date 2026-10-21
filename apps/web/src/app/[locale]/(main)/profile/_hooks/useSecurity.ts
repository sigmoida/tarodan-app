/** @format */

"use client";

import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  SIGN_IN_METHODS_ERROR_CODES,
  type SignInMethods,
} from "@tarodan/types";
import { api, signInMethodsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import { useWebList } from "@/hooks/useWebResource";
import { apiErrorCode, useWebMutation } from "@/hooks/useWebMutation";
import type { ChangePasswordValues, SetPasswordValues } from "../_lib/schemas";
import { PROFILE_RESOURCES } from "./useProfileInfo";
import { useReauth } from "./useReauth";

/** The signed-in account's sign-in methods (`GET /auth/sign-in-methods`). */
export function useSignInMethods(enabled = true) {
  const query = useWebList<SignInMethods>({
    resource: queryKeys.signInMethods.resource,
    fetcher: async () => (await signInMethodsApi.get()).data,
    enabled,
    query: { meta: { page: "profile-sign-in-methods" } },
  });
  return {
    methods: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Every sign-in method write answers the fresh `SignInMethods`: put it in the
 * cache (no second GET), so the page switches mode without a reload.
 */
export function useStoreSignInMethods() {
  const queryClient = useQueryClient();
  return (methods: SignInMethods) =>
    queryClient.setQueryData(queryKeys.signInMethods.list(), methods);
}

/** Refetch after a refusal that says the list on screen is stale. */
export function useRefreshSignInMethods() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: [queryKeys.signInMethods.resource],
    });
}

/**
 * Set the first password of an account without one, behind the step-up.
 * A `409 PASSWORD_ALREADY_SET` (another tab got there first) refreshes the
 * methods, so the section turns into "Change password".
 */
export function useSetPassword() {
  const t = useTranslations();
  const withReauth = useReauth();
  const storeMethods = useStoreSignInMethods();
  const refreshMethods = useRefreshSignInMethods();
  return useWebMutation(
    async (values: SetPasswordValues) => {
      try {
        const res = await withReauth((reauthToken) =>
          signInMethodsApi.setPassword({
            newPassword: values.newPassword,
            reauthToken,
          }),
        );
        return res.data;
      } catch (error) {
        if (
          apiErrorCode(error) === SIGN_IN_METHODS_ERROR_CODES.passwordAlreadySet
        ) {
          void refreshMethods();
        }
        throw error;
      }
    },
    {
      successMessage: t("profile.security.setPasswordSuccess"),
      onSuccess: storeMethods,
    },
  );
}

/** Whether TOTP two-factor auth is currently enabled. */
export function use2faStatus(enabled: boolean) {
  const query = useWebList<boolean>({
    resource: "profile-2fa-status",
    fetcher: async () => {
      const res = await api.get("/security/2fa/status").catch(() => null);
      return !!res?.data?.isEnabled;
    },
    enabled,
    query: { meta: { page: "profile-2fa-status" } },
  });
  return { is2faEnabled: query.data ?? false, isLoading: query.isLoading };
}

/** Change the account password. */
export function useChangePassword() {
  const t = useTranslations();
  return useWebMutation(
    async (values: ChangePasswordValues) => {
      await api.post("/security/password/change", {
        // As typed: the API compares the raw value with bcrypt.
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
    },
    {
      errorMessage: t("page.profile.usesecurity.sifreDegistirilemedi"),
      onSuccess: () => toast.success(t("settings.passwordChanged")),
    },
  );
}

/** SMS phone-verification: send a code, then verify it. */
export function usePhoneVerification() {
  const t = useTranslations();
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const sendCode = useWebMutation(
    (phone: string) => api.post("/auth/phone/send-code", { phone }),
    {
      errorMessage: t("profile.sendCodeFailed"),
      onSuccess: () => toast.success(t("profile.codeSent")),
    },
  );

  const verify = useWebMutation(
    (code: string) => api.post("/auth/phone/verify", { code }),
    {
      // Verification also writes the number (the profile save cannot while it
      // sits unverified on another account), so the profile form refreshes.
      invalidates: PROFILE_RESOURCES,
      errorMessage: t("profile.invalidCode"),
      onSuccess: async () => {
        toast.success(t("profile.phoneVerified"));
        await refreshUser();
      },
    },
  );

  return { sendCode, verify };
}
