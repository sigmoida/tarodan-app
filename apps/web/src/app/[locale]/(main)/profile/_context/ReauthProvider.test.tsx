// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The profile page's step-up end to end: the real provider, dialog, hooks,
 * API client and auth store, with only the network answered here. The
 * session marker is gone in every test (the worst case: any 401 would be
 * read as an ended session), so a step-up answer that reached the
 * session-gone path would sign the user out or run the session check.
 */

const h = vi.hoisted(() => ({
  getProfile: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@react-oauth/google", () => ({
  useGoogleOAuth: () => ({ scriptLoadedSuccessfully: true }),
  useGoogleLogin: () => vi.fn(),
}));
// The real client and sign-in methods API; the store's own calls are stubs.
vi.mock("@/lib/api", async () => {
  const { api } = await import("@/lib/api/client");
  const { signInMethodsApi } = await import("@/lib/api/sign-in-methods");
  return {
    api,
    default: api,
    signInMethodsApi,
    authApi: { forgotPassword: vi.fn() },
    userApi: { getProfile: h.getProfile },
    mediaApi: {},
    wishlistApi: {},
  };
});
vi.mock("@/lib/authMarker", () => ({
  hasAuthMarker: () => false,
  clearAuthMarker: vi.fn(),
}));
vi.mock("@/lib/server/auth-actions", () => ({
  loginAction: vi.fn(),
  googleLoginAction: vi.fn(),
  appleLoginAction: vi.fn(),
  logoutAction: vi.fn(),
}));
vi.mock("@/lib/query/getQueryClient", async () => {
  const { makeQueryClient } = await import("@/lib/query/client");
  const client = makeQueryClient();
  return { getQueryClient: () => client };
});

import { api } from "@/lib/api/client";
import { signInMethodsApi } from "@/lib/api/sign-in-methods";
import { getQueryClient } from "@/lib/query/getQueryClient";
import { useAuthStore } from "@/stores/authStore";
import { useReauth } from "../_hooks/useReauth";
import { useEmailChange } from "../_hooks/useProfileInfo";
import { useDeleteAccount } from "../_hooks/useDeleteAccount";
import ReauthProvider from "./ReauthProvider";

const TOKENS = ["step-up-token-1", "step-up-token-2"];
const ORDERS = ["orders", "list"];

type Answer = { status: number; data?: unknown };
type Route = (config: InternalAxiosRequestConfig) => Answer;

let routes: Record<string, Route>;
let requests: InternalAxiosRequestConfig[];
let reauthCount: number;

const answer: AxiosAdapter = async (config) => {
  requests.push(config);
  const key = `${config.method?.toUpperCase()} ${config.url}`;
  const route = routes[key];
  if (!route) throw new Error(`unexpected request ${key}`);
  const { status, data } = route(config);
  const response = { data, status, statusText: "", headers: {}, config };
  if (status >= 400) {
    return Promise.reject(
      Object.assign(new Error(`HTTP ${status}`), { config, response }),
    );
  }
  return response;
};

const refusal = (status: number, errorCode: string): Route => {
  return () => ({
    status,
    data: { statusCode: status, errorCode, message: `server:${errorCode}` },
  });
};

const sent = (key: string) =>
  requests.filter((c) => `${c.method?.toUpperCase()} ${c.url}` === key);
const body = (config: InternalAxiosRequestConfig) =>
  typeof config.data === "string" ? JSON.parse(config.data) : config.data;

let container: HTMLDivElement;
let root: Root;
let email: ReturnType<typeof useEmailChange>;
let del: ReturnType<typeof useDeleteAccount>;
let withReauth: ReturnType<typeof useReauth>;

function Harness() {
  email = useEmailChange();
  del = useDeleteAccount();
  withReauth = useReauth();
  return null;
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

const dialog = () => document.body.querySelector('[role="dialog"]');

/** Types the password into the open confirm step and submits it. */
async function confirmWithPassword(password = "secret") {
  const find = () =>
    document.body.querySelector(
      '[role="dialog"] input[type="password"]',
    ) as HTMLInputElement | null;
  for (let i = 0; i < 20 && !find(); i += 1) await flush();
  const input = find()!;
  expect(input).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(input, password);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const confirm = Array.from(
    document.body.querySelectorAll('[role="dialog"] button'),
  ).find((b) => b.textContent?.includes("common.confirm")) as HTMLElement;
  await act(async () => confirm.click());
  await flush();
}

function expectSessionKept() {
  expect(h.getProfile).not.toHaveBeenCalled();
  expect(useAuthStore.getState().isAuthenticated).toBe(true);
  expect(useAuthStore.getState().user?.id).toBe("u1");
  expect(getQueryClient().getQueryData(ORDERS)).toEqual(["u1-order"]);
  expect(h.push).not.toHaveBeenCalled();
}

beforeEach(() => {
  window.history.replaceState(null, "", "/profile");
  localStorage.clear();
  sessionStorage.clear();
  requests = [];
  reauthCount = 0;
  routes = {
    "GET /auth/sign-in-methods": () => ({
      status: 200,
      data: { hasPassword: true, providers: [] },
    }),
    "POST /auth/reauth": () => ({
      status: 200,
      data: {
        reauthToken: TOKENS[reauthCount++],
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      },
    }),
    "POST /auth/email/request-change": () => ({ status: 200, data: {} }),
    "DELETE /users/me": () => ({ status: 200, data: {} }),
  };
  api.defaults.adapter = answer;
  h.getProfile.mockReset();
  h.push.mockReset();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  useAuthStore.setState({
    user: { id: "u1", email: "member@example.com" } as never,
    isAuthenticated: true,
    isLoading: false,
  });
  getQueryClient().setQueryData(ORDERS, ["u1-order"]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <QueryClientProvider client={getQueryClient()}>
        <ReauthProvider>
          <Harness />
        </ReauthProvider>
      </QueryClientProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  getQueryClient().clear();
  useAuthStore.setState({ user: null, isAuthenticated: false });
});

describe("ReauthProvider: one step-up for the page", () => {
  it("confirms once, sends the token in the e-mail change body and the deletion header, and never stores it", async () => {
    act(() => email.sendCode.mutate("new@example.com"));
    await confirmWithPassword("  my pass ");

    expect(body(sent("POST /auth/reauth")[0])).toEqual({
      password: "  my pass ",
    });
    expect(body(sent("POST /auth/email/request-change")[0])).toEqual({
      newEmail: "new@example.com",
      reauthToken: TOKENS[0],
    });
    expect(dialog()).toBeNull();

    // Memory only: not in storage, a cookie, the auth store or the query cache.
    const kept = [
      ...Object.keys(localStorage).map((k) => localStorage.getItem(k)),
      ...Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k)),
      document.cookie,
      JSON.stringify(useAuthStore.getState()),
      JSON.stringify(
        getQueryClient()
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ].join("|");
    expect(kept).not.toContain(TOKENS[0]);

    // The deletion reuses the live token: no second prompt.
    act(() => del.mutate());
    await flush();
    expect(sent("POST /auth/reauth")).toHaveLength(1);
    expect(sent("DELETE /users/me")[0].headers["x-reauth-token"]).toBe(
      TOKENS[0],
    );
    expect(sent("DELETE /users/me")[0].data).toBeUndefined();
  });

  it("keeps the token out of every mutation state, after a success and after a failure", async () => {
    // Every string reachable from the cached mutations (data, error, variables).
    const mutationStrings = () => {
      const out: string[] = [];
      const seen = new Set<unknown>();
      const walk = (value: unknown, depth: number) => {
        if (typeof value === "string") out.push(value);
        if (
          !value ||
          typeof value !== "object" ||
          seen.has(value) ||
          depth > 12
        )
          return;
        seen.add(value);
        for (const key of Object.getOwnPropertyNames(value)) {
          walk((value as Record<string, unknown>)[key], depth + 1);
        }
      };
      for (const m of getQueryClient().getMutationCache().getAll()) {
        walk(m.state, 0);
      }
      return out.join("|");
    };

    act(() => email.sendCode.mutate("new@example.com"));
    await confirmWithPassword();
    expect(sent("POST /auth/email/request-change")).toHaveLength(1);
    expect(email.sendCode.isSuccess).toBe(true);
    expect(mutationStrings()).not.toContain(TOKENS[0]);

    // A refused guarded write: the error is kept in the mutation state.
    routes["DELETE /users/me"] = refusal(409, "ACCOUNT_HAS_OPEN_ORDERS");
    act(() => del.mutate());
    await flush();
    expect(sent("DELETE /users/me")[0].headers["x-reauth-token"]).toBe(
      TOKENS[0],
    );
    expect(del.isError).toBe(true);
    expect(
      (del.error as { response?: { status?: number } }).response?.status,
    ).toBe(409);
    expect(h.toast.error).toHaveBeenCalledWith(
      "server:ACCOUNT_HAS_OPEN_ORDERS",
    );
    expect(mutationStrings()).not.toContain(TOKENS[0]);
  });

  it("on 403 REAUTH_REQUIRED asks once more and retries once, then gives up without signing out", async () => {
    routes["POST /auth/email/request-change"] = refusal(403, "REAUTH_REQUIRED");

    act(() => email.sendCode.mutate("new@example.com"));
    await confirmWithPassword();
    // The first answer was 403: the step reopens once.
    expect(dialog()).not.toBeNull();
    await confirmWithPassword();

    expect(
      sent("POST /auth/email/request-change").map((c) => body(c).reauthToken),
    ).toEqual(TOKENS);
    expect(sent("POST /auth/reauth")).toHaveLength(2);
    expect(dialog()).toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith("server:REAUTH_REQUIRED");
    expectSessionKept();

    // The twice-refused token is not reused: the next write asks first.
    act(() => del.mutate());
    await flush();
    expect(dialog()).not.toBeNull();
    expect(sent("DELETE /users/me")).toHaveLength(0);
  });

  it.each([
    ["403 REAUTH_FAILED", refusal(403, "REAUTH_FAILED")],
    ["429 REAUTH_LOCKED", refusal(429, "REAUTH_LOCKED")],
    ["503 REAUTH_UNAVAILABLE", refusal(503, "REAUTH_UNAVAILABLE")],
    [
      "400 REAUTH_METHOD_NOT_ALLOWED",
      refusal(400, "REAUTH_METHOD_NOT_ALLOWED"),
    ],
  ])(
    "keeps %s from the confirm step in the dialog and the session alive",
    async (_, route) => {
      routes["POST /auth/reauth"] = route;
      act(() => email.sendCode.mutate("new@example.com"));
      await confirmWithPassword();

      const code = (route({} as never).data as { errorCode: string }).errorCode;
      expect(dialog()?.textContent).toContain(`server:${code}`);
      expect(sent("POST /auth/email/request-change")).toHaveLength(0);
      expectSessionKept();
    },
  );

  it.each([
    ["400 PROVIDER_TOKEN_INVALID", refusal(400, "PROVIDER_TOKEN_INVALID")],
    ["403 EMAIL_NOT_VERIFIED", refusal(403, "EMAIL_NOT_VERIFIED")],
    ["404 PROVIDER_NOT_LINKED", refusal(404, "PROVIDER_NOT_LINKED")],
    ["409 LAST_SIGN_IN_METHOD", refusal(409, "LAST_SIGN_IN_METHOD")],
  ])(
    "passes %s from a guarded write to the caller without a retry or a sign-out",
    async (_, route) => {
      routes["POST /auth/social/google/unlink"] = route;
      let result: Promise<unknown> | undefined;
      act(() => {
        result = withReauth((reauthToken) =>
          signInMethodsApi.unlink("google", { reauthToken }),
        ).catch((e) => e);
      });
      await confirmWithPassword();

      const error = (await result) as { response?: { status?: number } };
      expect(error.response?.status).toBe(route({} as never).status);
      expect(sent("POST /auth/social/google/unlink")).toHaveLength(1);
      expect(sent("POST /auth/reauth")).toHaveLength(1);
      expect(dialog()).toBeNull();
      expectSessionKept();
    },
  );
});
