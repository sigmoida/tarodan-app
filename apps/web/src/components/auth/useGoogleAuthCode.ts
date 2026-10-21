"use client";

import { useCallback, useRef } from "react";
import { useGoogleLogin, useGoogleOAuth } from "@react-oauth/google";

/** Google sign-in is offered only when the web client id is configured. */
export const isGoogleSignInAvailable = (): boolean =>
  !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/**
 * Google answered the popup with an OAuth error (not a cancellation), or its
 * script is not loaded yet (or was blocked), so no popup can open.
 */
export class GoogleAuthCodeError extends Error {
  constructor(message = "google_auth_code_failed") {
    super(message);
    this.name = "GoogleAuthCodeError";
  }
}

interface Pending {
  resolve: (code: string | null) => void;
  reject: (error: Error) => void;
}

/**
 * The one Google credential step on web, shared by login, the step-up and
 * Connected accounts. It uses the GSI auth-code popup: the popup returns a
 * one-time `code` that the API exchanges with Google and whose `id_token` it
 * verifies, so no Google token reaches our JS.
 *
 * `requestCode()` opens the popup and resolves with the code, or with `null`
 * when the user closes it (or the browser blocks it); it rejects with
 * `GoogleAuthCodeError` on an OAuth error, and at once when Google's script
 * has not loaded (the library would otherwise never call back). Call it straight from a click
 * handler: browsers block a popup opened after an `await`.
 *
 * `selectAccount` shows Google's account chooser even when one account is
 * signed in: the step-up must be a deliberate, fresh sign-in, and linking must
 * let the user pick which Google account to connect.
 */
export function useGoogleAuthCode({
  selectAccount = false,
}: { selectAccount?: boolean } = {}) {
  const pending = useRef<Pending | null>(null);
  const { scriptLoadedSuccessfully } = useGoogleOAuth();

  const settle = (apply: (p: Pending) => void) => {
    const current = pending.current;
    pending.current = null;
    if (current) apply(current);
  };

  const login = useGoogleLogin({
    flow: "auth-code",
    select_account: selectAccount,
    onSuccess: ({ code }) => settle((p) => p.resolve(code)),
    onError: () => settle((p) => p.reject(new GoogleAuthCodeError())),
    // Popup closed by the user, blocked, or failed to open: not an error.
    onNonOAuthError: () => settle((p) => p.resolve(null)),
  });

  const requestCode = useCallback(
    () =>
      new Promise<string | null>((resolve, reject) => {
        if (!scriptLoadedSuccessfully) {
          reject(new GoogleAuthCodeError("google_script_not_loaded"));
          return;
        }
        // A second click while a popup is open supersedes the first request.
        pending.current?.resolve(null);
        pending.current = { resolve, reject };
        login();
      }),
    [login, scriptLoadedSuccessfully],
  );

  return { isAvailable: isGoogleSignInAvailable(), requestCode };
}
