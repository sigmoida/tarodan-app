// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCancellation } from "@/lib/query/client";
import {
  GuardedRequestError,
  REAUTH_EXPIRY_MARGIN_MS,
  ReauthCancelledError,
  isReauthRequired,
  useReauthController,
  type ReauthController,
} from "./useReauth";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The step-up state machine (sign-in methods plan T11; contract
 * 2026-10-21-sign-in-methods-step-up-and-connected-accounts): it asks once,
 * reuses the token within its life, re-asks exactly once on
 * `403 REAUTH_REQUIRED`, and keeps the token in memory only.
 */

const NOW = Date.parse("2026-10-21T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const apiError = (status: number, errorCode?: string) => ({
  response: { status, data: { errorCode, message: `m:${errorCode}` } },
});

let container: HTMLDivElement;
let root: Root;
let ctl: ReauthController;

function Harness() {
  ctl = useReauthController();
  return null;
}

/** Answers the open confirm step with a token. */
function confirm(token: string, expiresAt = iso(NOW + 300_000)) {
  expect(ctl.isOpen).toBe(true);
  act(() => ctl.confirm({ reauthToken: token, expiresAt }));
}

/** Lets the awaited promises inside `withReauth` settle. */
const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("useReauthController", () => {
  it("opens the confirm step without a token and runs the action with the confirmed one", async () => {
    const action = vi.fn(async (token: string) => ({ data: `done:${token}` }));
    let result: Promise<string> | undefined;
    act(() => {
      result = ctl.withReauth(action);
    });
    expect(ctl.isOpen).toBe(true);
    expect(action).not.toHaveBeenCalled();

    confirm("tok-1");
    await flush();

    expect(ctl.isOpen).toBe(false);
    await expect(result).resolves.toBe("done:tok-1");
    expect(action).toHaveBeenCalledWith("tok-1");
  });

  it("reuses the token for a second write within its life (no second prompt)", async () => {
    act(() => void ctl.withReauth(async () => ({ data: "first" })));
    confirm("tok-1");
    await flush();

    const second = vi.fn(async (token: string) => ({ data: token }));
    let result: Promise<string> | undefined;
    act(() => {
      result = ctl.withReauth(second);
    });
    expect(ctl.isOpen).toBe(false);
    await expect(result).resolves.toBe("tok-1");
  });

  it("asks again once the token is within the expiry margin", async () => {
    act(() => void ctl.withReauth(async () => ({ data: "first" })));
    confirm("tok-1", iso(NOW + 60_000));
    await flush();

    vi.setSystemTime(NOW + 60_000 - REAUTH_EXPIRY_MARGIN_MS);
    act(
      () =>
        void ctl.withReauth(async () => ({ data: "second" })).catch(() => {}),
    );
    expect(ctl.isOpen).toBe(true);
  });

  it("does not cache a token whose expiry it cannot read", async () => {
    act(() => void ctl.withReauth(async () => ({ data: "first" })));
    confirm("tok-1", "not-a-date");
    await flush();

    act(
      () =>
        void ctl.withReauth(async () => ({ data: "second" })).catch(() => {}),
    );
    expect(ctl.isOpen).toBe(true);
  });

  it("on 403 REAUTH_REQUIRED asks once more and retries once with the new token", async () => {
    const action = vi
      .fn<(token: string) => Promise<{ data: string }>>()
      .mockRejectedValueOnce(apiError(403, "REAUTH_REQUIRED"))
      .mockImplementation(async (token) => ({ data: `done:${token}` }));
    let result: Promise<string> | undefined;
    act(() => {
      result = ctl.withReauth(action);
    });
    confirm("stale");
    await flush();

    // The first answer was 403: the step reopens instead of failing.
    expect(ctl.isOpen).toBe(true);
    confirm("fresh");
    await flush();

    await expect(result).resolves.toBe("done:fresh");
    expect(action.mock.calls.map(([token]) => token)).toEqual([
      "stale",
      "fresh",
    ]);
  });

  it("gives up after the one retry: a second 403 is the caller's error", async () => {
    const required = apiError(403, "REAUTH_REQUIRED");
    const action = vi.fn(async () => {
      throw required;
    });
    let result: Promise<unknown> | undefined;
    act(() => {
      result = ctl.withReauth(action).catch((e) => e);
    });
    confirm("one");
    await flush();
    confirm("two");
    await flush();

    expect(await result).toMatchObject({ response: required.response });
    expect(action).toHaveBeenCalledTimes(2);
    expect(ctl.isOpen).toBe(false);

    // The twice-refused token is dropped: the next write asks first.
    const next = vi.fn(async () => ({ data: "next" }));
    act(() => void ctl.withReauth(next).catch(() => {}));
    expect(ctl.isOpen).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ["403 REAUTH_FAILED", apiError(403, "REAUTH_FAILED")],
    ["429 REAUTH_LOCKED", apiError(429, "REAUTH_LOCKED")],
    ["503 REAUTH_UNAVAILABLE", apiError(503, "REAUTH_UNAVAILABLE")],
    ["409 LAST_SIGN_IN_METHOD", apiError(409, "LAST_SIGN_IN_METHOD")],
    ["401 (session gone)", apiError(401)],
  ])("passes %s through without reopening the step", async (_, error) => {
    let result: Promise<unknown> | undefined;
    act(() => {
      result = ctl
        .withReauth(async () => {
          throw error;
        })
        .catch((e) => e);
    });
    confirm("tok");
    await flush();

    expect(await result).toMatchObject({ response: error.response });
    expect(ctl.isOpen).toBe(false);
  });

  it("drops a confirmation that arrives after the user closed the step", async () => {
    let result: Promise<unknown> | undefined;
    act(() => {
      result = ctl.withReauth(vi.fn()).catch((e) => e);
    });
    act(() => ctl.cancel());
    expect(await result).toBeInstanceOf(ReauthCancelledError);

    // The provider popup finished late and the step-up answered anyway.
    act(() =>
      ctl.confirm({ reauthToken: "late", expiresAt: iso(NOW + 300_000) }),
    );
    const next = vi.fn(async (token: string) => ({ data: token }));
    act(() => void ctl.withReauth(next).catch(() => {}));
    expect(ctl.isOpen).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it("on a 403 retries with a token another write confirmed meanwhile", async () => {
    act(() => void ctl.withReauth(async () => ({ data: "seed" })));
    confirm("t1");
    await flush();

    let rejectB!: (e: unknown) => void;
    const b = vi
      .fn<(token: string) => Promise<{ data: string }>>()
      .mockImplementationOnce(
        () => new Promise((_, reject) => (rejectB = reject)),
      )
      .mockImplementation(async (token) => ({ data: `b:${token}` }));
    const a = vi
      .fn<(token: string) => Promise<{ data: string }>>()
      .mockRejectedValueOnce(apiError(403, "REAUTH_REQUIRED"))
      .mockImplementation(async (token) => ({ data: `a:${token}` }));

    let resultA: Promise<string> | undefined;
    let resultB: Promise<string> | undefined;
    act(() => {
      resultB = ctl.withReauth(b);
      resultA = ctl.withReauth(a);
    });
    await flush();
    confirm("t2");
    await flush();
    await expect(resultA).resolves.toBe("a:t2");

    // B's 403 lands after A re-confirmed: no second prompt.
    await act(async () => rejectB(apiError(403, "REAUTH_REQUIRED")));
    await flush();
    expect(ctl.isOpen).toBe(false);
    await expect(resultB).resolves.toBe("b:t2");
  });

  it("shares one confirm step between two writes that ask at once", async () => {
    let a: Promise<string> | undefined;
    let b: Promise<string> | undefined;
    act(() => {
      a = ctl.withReauth(async (t) => ({ data: `a:${t}` }));
      b = ctl.withReauth(async (t) => ({ data: `b:${t}` }));
    });
    confirm("tok");
    await flush();
    await expect(a).resolves.toBe("a:tok");
    await expect(b).resolves.toBe("b:tok");
  });

  it("rejects with a cancellation (no toast, no report) when the user closes the step", async () => {
    const action = vi.fn();
    let result: Promise<unknown> | undefined;
    act(() => {
      result = ctl.withReauth(action).catch((e) => e);
    });
    act(() => ctl.cancel());

    const error = await result;
    expect(error).toBeInstanceOf(ReauthCancelledError);
    expect(isCancellation(error)).toBe(true);
    expect(action).not.toHaveBeenCalled();
    expect(ctl.isOpen).toBe(false);
  });

  it("ends a waiting write when the page unmounts", async () => {
    let result: Promise<unknown> | undefined;
    act(() => {
      result = ctl.withReauth(vi.fn()).catch((e) => e);
    });
    act(() => root.unmount());
    expect(await result).toBeInstanceOf(ReauthCancelledError);
    // afterEach unmounts again: give it a fresh root.
    root = createRoot(container);
  });

  it("never persists the token: no storage, no cookie", async () => {
    act(() => void ctl.withReauth(async () => ({ data: "x" })));
    confirm("secret-step-up-token");
    await flush();

    const stored = [
      ...Object.keys(localStorage).map((k) => localStorage.getItem(k)),
      ...Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k)),
      document.cookie,
    ].join("|");
    expect(stored).not.toContain("secret-step-up-token");
  });
});

describe("useReauthController: what a guarded write hands back", () => {
  const TOKEN = "secret-step-up-token";
  /** An axios-shaped answer whose request carries the token. */
  const axiosLike = (token: string, status = 200) => {
    const config = {
      url: "/users/me",
      method: "delete",
      headers: { "x-reauth-token": token },
      data: JSON.stringify({ reauthToken: token }),
    };
    return {
      data: status < 400 ? { ok: true } : { errorCode: "LAST_SIGN_IN_METHOD" },
      status,
      config,
      request: { _header: `x-reauth-token: ${token}` },
    };
  };

  it("resolves with the body only, never the request", async () => {
    let result: Promise<unknown> | undefined;
    act(() => {
      result = ctl.withReauth(async (t) => axiosLike(t));
    });
    confirm(TOKEN);
    await flush();
    const value = await result;
    expect(value).toEqual({ ok: true });
    expect(JSON.stringify(value)).not.toContain(TOKEN);
  });

  it("rejects with the answer but without the request", async () => {
    let result: Promise<unknown> | undefined;
    act(() => {
      result = ctl
        .withReauth(async (t) => {
          const answer = axiosLike(t, 409);
          throw Object.assign(
            new Error("Request failed with status code 409"),
            {
              name: "AxiosError",
              code: "ERR_BAD_REQUEST",
              config: answer.config,
              request: answer.request,
              response: answer,
            },
          );
        })
        .catch((e) => e);
    });
    confirm(TOKEN);
    await flush();
    const error = (await result) as Record<string, unknown>;

    expect(error).toBeInstanceOf(GuardedRequestError);
    expect(error).toMatchObject({
      name: "AxiosError",
      code: "ERR_BAD_REQUEST",
      response: { status: 409, data: { errorCode: "LAST_SIGN_IN_METHOD" } },
      config: { url: "/users/me", method: "delete" },
    });
    expect(error.request).toBeUndefined();
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain(
      TOKEN,
    );
  });
});

describe("isReauthRequired", () => {
  it("is true only for 403 with errorCode REAUTH_REQUIRED", () => {
    expect(isReauthRequired(apiError(403, "REAUTH_REQUIRED"))).toBe(true);
    expect(isReauthRequired(apiError(403, "REAUTH_FAILED"))).toBe(false);
    expect(isReauthRequired(apiError(403, "USER_BANNED"))).toBe(false);
    expect(isReauthRequired(apiError(401, "REAUTH_REQUIRED"))).toBe(false);
    expect(isReauthRequired(new Error("network"))).toBe(false);
  });
});
