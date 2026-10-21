"use client";

import { useCallback } from "react";
import type { SignInProvider } from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import { GoogleAuthCodeError, useGoogleAuthCode } from "./useGoogleAuthCode";
import { AppleCredentialError, useAppleCredential } from "./useAppleCredential";

/** A fresh provider sign-in, in the shape the step-up and link routes take. */
export type ProviderCredential =
  | { provider: "google"; code: string }
  | { provider: "apple"; identityToken: string };

/**
 * One fresh provider sign-in for the account area (the step-up and
 * Connected accounts), on top of the same credential hooks login uses.
 * Google always shows its account chooser here.
 *
 * `request(provider)` must be called straight from a click handler (popup
 * rules). It resolves with `null` when the user closes the popup.
 */
export function useProviderCredential() {
  const google = useGoogleAuthCode({ selectAccount: true });
  const apple = useAppleCredential();

  const isAvailable = useCallback(
    (provider: SignInProvider) =>
      provider === "google" ? google.isAvailable : apple.isAvailable,
    [google.isAvailable, apple.isAvailable],
  );

  const { requestCode } = google;
  const { requestCredential } = apple;
  const request = useCallback(
    async (provider: SignInProvider): Promise<ProviderCredential | null> => {
      if (provider === "google") {
        const code = await requestCode();
        return code ? { provider, code } : null;
      }
      const credential = await requestCredential();
      return credential
        ? { provider, identityToken: credential.identityToken }
        : null;
    },
    [requestCode, requestCredential],
  );

  return { isAvailable, request };
}

/** The message for a failed provider popup (not for an API answer). */
export function providerCredentialErrorKey(
  error: unknown,
): MessageKey | undefined {
  if (error instanceof GoogleAuthCodeError) return "auth.googleSignInFailed";
  if (error instanceof AppleCredentialError) {
    return error.reason === "script"
      ? "auth.appleScriptFailed"
      : "auth.appleSignInFailed";
  }
  return undefined;
}
