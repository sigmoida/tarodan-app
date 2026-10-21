// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCancellation } from "@/hooks/useWebMutation";
import {
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
    const action = vi.fn(async (token: string) => `done:${token}`);
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
    act(() => void ctl.withReauth(async () => "first"));
    confirm("tok-1");
    await flush();

    const second = vi.fn(async (token: string) => token);
    let result: Promise<string> | undefined;
    act(() => {
      result = ctl.withReauth(second);
    });
    expect(ctl.isOpen).toBe(false);
    await expect(result).resolves.toBe("tok-1");
  });

  it("asks again once the token is within the expiry margin", async () => {
    act(() => void ctl.withReauth(async () => "first"));
    confirm("tok-1", iso(NOW + 60_000));
    await flush();

    vi.setSystemTime(NOW + 60_000 - REAUTH_EXPIRY_MARGIN_MS);
    act(() => void ctl.withReauth(async () => "second").catch(() => {}));
    expect(ctl.isOpen).toBe(true);
  });

  it("does not cache a token whose expiry it cannot read", async () => {
    act(() => void ctl.withReauth(async () => "first"));
    confirm("tok-1", "not-a-date");
    await flush();

    act(() => void ctl.withReauth(async () => "second").catch(() => {}));
    expect(ctl.isOpen).toBe(true);
  });

  it("on 403 REAUTH_REQUIRED asks once more and retries once with the new token", async () => {
    const action = vi
      .fn<(token: string) => Promise<string>>()
      .mockRejectedValueOnce(apiError(403, "REAUTH_REQUIRED"))
      .mockImplementation(async (token) => `done:${token}`);
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

    expect(await result).toBe(required);
    expect(action).toHaveBeenCalledTimes(2);
    expect(ctl.isOpen).toBe(false);
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

    expect(await result).toBe(error);
    expect(ctl.isOpen).toBe(false);
  });

  it("shares one confirm step between two writes that ask at once", async () => {
    let a: Promise<string> | undefined;
    let b: Promise<string> | undefined;
    act(() => {
      a = ctl.withReauth(async (t) => `a:${t}`);
      b = ctl.withReauth(async (t) => `b:${t}`);
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
    act(() => void ctl.withReauth(async () => "x"));
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

describe("isReauthRequired", () => {
  it("is true only for 403 with errorCode REAUTH_REQUIRED", () => {
    expect(isReauthRequired(apiError(403, "REAUTH_REQUIRED"))).toBe(true);
    expect(isReauthRequired(apiError(403, "REAUTH_FAILED"))).toBe(false);
    expect(isReauthRequired(apiError(403, "USER_BANNED"))).toBe(false);
    expect(isReauthRequired(apiError(401, "REAUTH_REQUIRED"))).toBe(false);
    expect(isReauthRequired(new Error("network"))).toBe(false);
  });
});
