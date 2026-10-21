"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import {
  SIGN_IN_METHODS_ERROR_CODES,
  SIGN_IN_PROVIDER_NAMES,
  type SignInProvider,
} from "@tarodan/types";
import { signInMethodsApi } from "@/lib/api";
import { apiErrorCode, useWebMutation } from "@/hooks/useWebMutation";
import {
  providerCredentialErrorKey,
  useProviderCredential,
  type ProviderCredential,
} from "@/components/auth/useProviderCredential";
import { useReauth } from "./useReauth";
import { useRefreshSignInMethods, useStoreSignInMethods } from "./useSecurity";

/** Refusals that mean the list on screen is out of date: refetch it. */
const STALE_LIST_CODES: ReadonlySet<string> = new Set([
  SIGN_IN_METHODS_ERROR_CODES.providerAlreadyLinked,
  SIGN_IN_METHODS_ERROR_CODES.providerNotLinked,
  SIGN_IN_METHODS_ERROR_CODES.lastSignInMethod,
]);

/**
 * Connect and disconnect Google and Apple, both behind the step-up.
 *
 * Connect asks the provider first, straight from the click (a popup opened
 * after an `await` is blocked), then confirms it is the user and links. The
 * credential is not spent by a `403 REAUTH_REQUIRED` (the step-up guard runs
 * before the route), so the retry reuses it.
 *
 * Errors are the API's localised messages through `useWebMutation`; a `409
 * LAST_SIGN_IN_METHOD` race shows the same text as the D1 hint
 * (`server.auth.lastSignInMethod` = `profile.connectedAccounts.lastMethodHint`)
 * and the refetch then disables Disconnect.
 */
export function useConnectedAccounts() {
  const t = useTranslations();
  const withReauth = useReauth();
  const credentials = useProviderCredential();
  const storeMethods = useStoreSignInMethods();
  const refreshMethods = useRefreshSignInMethods();
  const [opening, setOpening] = useState<SignInProvider | null>(null);

  const refreshIfStale = (error: unknown) => {
    const code = apiErrorCode(error);
    if (code && STALE_LIST_CODES.has(code)) void refreshMethods();
  };

  const link = useWebMutation(
    async (credential: ProviderCredential) => {
      try {
        return await withReauth((reauthToken) =>
          credential.provider === "google"
            ? signInMethodsApi.linkGoogle({
                code: credential.code,
                reauthToken,
              })
            : signInMethodsApi.linkApple({
                identityToken: credential.identityToken,
                reauthToken,
              }),
        );
      } catch (error) {
        refreshIfStale(error);
        throw error;
      }
    },
    {
      onSuccess: (methods, credential) => {
        storeMethods(methods);
        toast.success(
          t("profile.connectedAccounts.connectSuccess", {
            provider: SIGN_IN_PROVIDER_NAMES[credential.provider],
          }),
        );
      },
    },
  );

  const unlink = useWebMutation(
    async (provider: SignInProvider) => {
      try {
        return await withReauth((reauthToken) =>
          signInMethodsApi.unlink(provider, { reauthToken }),
        );
      } catch (error) {
        refreshIfStale(error);
        throw error;
      }
    },
    {
      onSuccess: (methods, provider) => {
        storeMethods(methods);
        toast.success(
          t("profile.connectedAccounts.disconnectSuccess", {
            provider: SIGN_IN_PROVIDER_NAMES[provider],
          }),
        );
      },
    },
  );

  /** Call straight from the click handler (popup rules). */
  const connect = async (provider: SignInProvider) => {
    setOpening(provider);
    try {
      const credential = await credentials.request(provider);
      if (credential) link.mutate(credential);
    } catch (error) {
      toast.error(
        t(providerCredentialErrorKey(error) ?? "common.operationFailed"),
      );
    } finally {
      setOpening(null);
    }
  };

  /** The provider whose row is busy (popup open or a write running). */
  const busyProvider: SignInProvider | null =
    opening ??
    (link.isPending ? (link.variables?.provider ?? null) : null) ??
    (unlink.isPending ? (unlink.variables ?? null) : null);

  return {
    canConnect: credentials.isAvailable,
    connect,
    disconnect: (provider: SignInProvider) => unlink.mutate(provider),
    busyProvider,
  };
}
