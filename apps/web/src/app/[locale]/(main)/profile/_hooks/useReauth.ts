"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  SIGN_IN_METHODS_ERROR_CODES,
  type ReauthResponse,
} from "@tarodan/types";
import { apiErrorCode } from "@/hooks/useWebMutation";

/**
 * The user closed the confirm step. Named `AbortError` on purpose: the shared
 * mutation layer treats it as a cancellation, so there is no error toast and
 * no Sentry report (`isCancellation`, `shouldReportMutationError`).
 */
export class ReauthCancelledError extends Error {
  constructor() {
    super("reauth_cancelled");
    this.name = "AbortError";
  }
}

/** `403 REAUTH_REQUIRED`: the token is missing, expired or foreign. */
export function isReauthRequired(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } })?.response
    ?.status;
  return (
    status === 403 &&
    apiErrorCode(error) === SIGN_IN_METHODS_ERROR_CODES.reauthRequired
  );
}

/**
 * A cached token is reused only while it has this much life left by the
 * device clock. `expiresAt` is server time; a skewed clock is covered by the
 * one retry on `403 REAUTH_REQUIRED`.
 */
export const REAUTH_EXPIRY_MARGIN_MS = 15_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface PendingRequest {
  promise: Promise<string>;
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}

export interface ReauthController {
  /**
   * Runs `action` with a live step-up token. Without a cached one it opens the
   * confirm step and waits; closing it rejects with `ReauthCancelledError`.
   * When `action` fails with `403 REAUTH_REQUIRED`, it drops the token, asks
   * once more and retries once; any other error (and a second 403) is thrown
   * as is. It never signs the user out: only a 401 means the session is gone,
   * and the API client handles that.
   */
  withReauth: <T>(action: (reauthToken: string) => Promise<T>) => Promise<T>;
  /** Whether the confirm step is open (bound to `ReauthModal`). */
  isOpen: boolean;
  /** The confirm step succeeded. */
  confirm: (response: ReauthResponse) => void;
  /** The user closed the confirm step. */
  cancel: () => void;
}

/**
 * The step-up state machine. The token lives in a ref of the component that
 * owns this hook, so it is memory only: never in storage, a store, a cookie or
 * the query cache, and gone when that component unmounts (contract: a leaked
 * token is a 5-minute step-up bypass).
 */
export function useReauthController(): ReauthController {
  const tokenRef = useRef<CachedToken | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const requestToken = useCallback((): Promise<string> => {
    // Two writes asking at once share one confirm step.
    if (pendingRef.current) return pendingRef.current.promise;
    let resolve!: (token: string) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    pendingRef.current = { promise, resolve, reject };
    setIsOpen(true);
    return promise;
  }, []);

  const liveToken = useCallback((): string | null => {
    const cached = tokenRef.current;
    if (cached && Date.now() < cached.expiresAt - REAUTH_EXPIRY_MARGIN_MS) {
      return cached.token;
    }
    tokenRef.current = null;
    return null;
  }, []);

  const withReauth = useCallback(
    async <T>(action: (reauthToken: string) => Promise<T>): Promise<T> => {
      const token = liveToken() ?? (await requestToken());
      try {
        return await action(token);
      } catch (error) {
        if (!isReauthRequired(error)) throw error;
        if (tokenRef.current?.token === token) tokenRef.current = null;
        return action(await requestToken());
      }
    },
    [liveToken, requestToken],
  );

  const confirm = useCallback((response: ReauthResponse) => {
    const expiresAt = Date.parse(response.expiresAt);
    // An unreadable expiry is used for this request only, never cached.
    tokenRef.current = Number.isFinite(expiresAt)
      ? { token: response.reauthToken, expiresAt }
      : null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    setIsOpen(false);
    pending?.resolve(response.reauthToken);
  }, []);

  const cancel = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setIsOpen(false);
    pending?.reject(new ReauthCancelledError());
  }, []);

  // Leaving the page drops the token and ends a waiting write.
  useEffect(
    () => () => {
      tokenRef.current = null;
      pendingRef.current?.reject(new ReauthCancelledError());
      pendingRef.current = null;
    },
    [],
  );

  return { withReauth, isOpen, confirm, cancel };
}

type WithReauth = ReauthController["withReauth"];

export const ReauthContext = createContext<WithReauth | null>(null);

/**
 * `withReauth` of the nearest `ReauthProvider` (the profile page). One
 * provider means one confirm step and one cached token for every sensitive
 * write on the page (set a password, then connect, without a second prompt).
 */
export function useReauth(): WithReauth {
  const withReauth = useContext(ReauthContext);
  if (!withReauth) {
    throw new Error("useReauth must be used within ReauthProvider");
  }
  return withReauth;
}
