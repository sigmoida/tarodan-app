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
 * no Sentry report (`isCancellation` in `lib/query/client`).
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

/** A write behind the step-up: the API call, given the token. */
export type GuardedRequest<T> = (reauthToken: string) => Promise<{ data: T }>;

/**
 * A guarded write that failed, without its request. An axios error keeps the
 * request (`config.data`, `config.headers`, `request`) and so the step-up
 * token, and the mutation cache would hold it as `state.error`. This keeps
 * what callers read: the answer (`response.status`, `response.data`), `name`
 * and `code` (cancellation), and `config.url`/`config.method` for the Sentry
 * report.
 */
export class GuardedRequestError extends Error {
  readonly code?: string;
  readonly response?: { status: number; data: unknown };
  readonly config?: { url?: string; method?: string };

  constructor(source: {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    response?: { status?: unknown; data?: unknown };
    config?: { url?: unknown; method?: unknown };
  }) {
    super(
      typeof source.message === "string" ? source.message : "request_failed",
    );
    this.name = typeof source.name === "string" ? source.name : "Error";
    if (typeof source.code === "string") this.code = source.code;
    if (source.response && typeof source.response.status === "number") {
      this.response = {
        status: source.response.status,
        data: source.response.data,
      };
    }
    if (source.config) {
      this.config = {
        url:
          typeof source.config.url === "string" ? source.config.url : undefined,
        method:
          typeof source.config.method === "string"
            ? source.config.method
            : undefined,
      };
    }
  }
}

/**
 * Runs a guarded write and returns only its body: the axios response keeps
 * the request (and so the token) in `config`, and the mutation cache would
 * hold it as `state.data`. A failure loses its request the same way.
 */
async function runGuarded<T>(
  request: GuardedRequest<T>,
  reauthToken: string,
): Promise<T> {
  try {
    return (await request(reauthToken)).data;
  } catch (error) {
    if (error && typeof error === "object") {
      throw new GuardedRequestError(error as never);
    }
    throw error;
  }
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
   * Runs the guarded write `request` with a live step-up token and resolves
   * with the answer's body only. Without a cached token it opens the confirm
   * step and waits; closing it rejects with `ReauthCancelledError`. When the
   * write fails with `403 REAUTH_REQUIRED`, it drops the token, asks once
   * more and retries once; any other error (and a second 403, whose token is
   * dropped too) is thrown as a `GuardedRequestError`, which carries the
   * answer but not the request. Neither the result nor the error holds the
   * token, so the mutation cache never does. It never signs the user out:
   * only a 401 means the session is gone, and the API client handles that.
   */
  withReauth: <T>(request: GuardedRequest<T>) => Promise<T>;
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

  const dropToken = useCallback((token: string) => {
    if (tokenRef.current?.token === token) tokenRef.current = null;
  }, []);

  const withReauth = useCallback(
    async <T>(request: GuardedRequest<T>): Promise<T> => {
      const token = liveToken() ?? (await requestToken());
      try {
        return await runGuarded(request, token);
      } catch (error) {
        if (!isReauthRequired(error)) throw error;
        dropToken(token);
        // Another write may have confirmed meanwhile: use its token.
        const retry = liveToken() ?? (await requestToken());
        try {
          return await runGuarded(request, retry);
        } catch (retryError) {
          // Refused twice: the next write asks again instead of a third 403.
          if (isReauthRequired(retryError)) dropToken(retry);
          throw retryError;
        }
      }
    },
    [dropToken, liveToken, requestToken],
  );

  const confirm = useCallback((response: ReauthResponse) => {
    const pending = pendingRef.current;
    // Nobody is waiting (the user closed the step while a provider popup was
    // still open): a step-up they cancelled is never kept.
    if (!pending) return;
    const expiresAt = Date.parse(response.expiresAt);
    // An unreadable expiry is used for this request only, never cached.
    tokenRef.current = Number.isFinite(expiresAt)
      ? { token: response.reauthToken, expiresAt }
      : null;
    pendingRef.current = null;
    setIsOpen(false);
    pending.resolve(response.reauthToken);
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
