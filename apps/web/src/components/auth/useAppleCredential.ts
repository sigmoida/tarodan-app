"use client";

import { useCallback } from "react";

const SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;

/** Apple's JS SDK. Listed in docs/PCI_PAYMENT_PAGE.md; never on card pages. */
export const APPLE_JS_URL =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: Record<string, unknown>) => void;
        signIn: () => Promise<AppleSignInResponse>;
      };
    };
  }
}

interface AppleSignInResponse {
  authorization?: { id_token?: string };
  user?: { name?: { firstName?: string; lastName?: string } };
}

/** Sign in with Apple is offered only when the Services ID and return URL are set. */
export const isAppleSignInAvailable = (): boolean =>
  !!SERVICES_ID && !!REDIRECT_URI;

export interface AppleCredential {
  identityToken: string;
  /** Apple sends the name only on the first authorisation, never again. */
  fullName?: string;
}

/** Why the Apple popup gave no credential (a closed popup is not an error). */
export class AppleCredentialError extends Error {
  constructor(
    readonly reason: "script" | "failed",
    message?: string,
  ) {
    super(message ?? `apple_credential_${reason}`);
    this.name = "AppleCredentialError";
  }
}

/**
 * The one Sign in with Apple credential step on web, shared by login, the
 * step-up and Connected accounts. Popup flow: Apple's JS SDK returns an
 * `id_token` that the API verifies against Apple's JWKS. There is no redirect
 * and no callback route, but Apple still compares `redirectURI` with the
 * registered return URLs, so the value must match exactly. Web sends no
 * `authorizationCode` (contract: only mobile does).
 *
 * `requestCredential()` resolves with the credential, or with `null` when the
 * user closes the popup; it rejects with `AppleCredentialError`. The SDK must
 * already be loaded (`AppleSdkScript`), and the call must come straight from a
 * click handler, or the browser blocks the popup.
 */
export function useAppleCredential() {
  const requestCredential =
    useCallback(async (): Promise<AppleCredential | null> => {
      const appleId =
        typeof window === "undefined" ? undefined : window.AppleID;
      if (!appleId) throw new AppleCredentialError("script");
      appleId.auth.init({
        clientId: SERVICES_ID,
        redirectURI: REDIRECT_URI,
        scope: "name email",
        usePopup: true,
      });
      let data: AppleSignInResponse;
      try {
        data = await appleId.auth.signIn();
      } catch (e) {
        if ((e as { error?: string })?.error === "popup_closed_by_user") {
          return null;
        }
        throw new AppleCredentialError(
          "failed",
          (e as { message?: string })?.message,
        );
      }
      const identityToken = data?.authorization?.id_token;
      if (!identityToken) throw new AppleCredentialError("failed");
      const name = data?.user?.name;
      const fullName = name
        ? [name.firstName, name.lastName].filter(Boolean).join(" ") || undefined
        : undefined;
      return { identityToken, fullName };
    }, []);

  return { isAvailable: isAppleSignInAvailable(), requestCredential };
}
