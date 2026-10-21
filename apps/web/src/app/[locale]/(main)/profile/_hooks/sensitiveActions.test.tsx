// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Account deletion and the e-mail change request send the step-up token
 * (`X-Reauth-Token` on the DELETE, `reauthToken` in the body), so the setting
 * `auth_require_reauth_for_sensitive_actions` can be switched on later.
 */

const h = vi.hoisted(() => ({
  post: vi.fn(),
  del: vi.fn(),
  logout: vi.fn(),
  push: vi.fn(),
  withReauth: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/lib/api", () => ({
  api: { post: h.post, delete: h.del },
  mediaApi: {},
  userApi: {},
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({ logout: h.logout, refreshUser: vi.fn() }),
}));

import { ReauthContext } from "./useReauth";
import { useDeleteAccount } from "./useDeleteAccount";
import { useEmailChange } from "./useProfileInfo";

let container: HTMLDivElement;
let root: Root;
let del: ReturnType<typeof useDeleteAccount>;
let email: ReturnType<typeof useEmailChange>;

function Harness() {
  del = useDeleteAccount();
  email = useEmailChange();
  return null;
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 3; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

beforeEach(() => {
  for (const fn of [h.post, h.del, h.logout, h.push]) fn.mockReset();
  h.post.mockResolvedValue({ data: {} });
  h.del.mockResolvedValue({ data: {} });
  h.withReauth
    .mockReset()
    .mockImplementation(
      async (request: (token: string) => Promise<{ data: unknown }>) =>
        (await request("step-up-token")).data,
    );
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <ReauthContext.Provider value={h.withReauth}>
          <Harness />
        </ReauthContext.Provider>
      </QueryClientProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
});

describe("account deletion", () => {
  it("sends the step-up token in the X-Reauth-Token header", async () => {
    act(() => del.mutate());
    await flush();

    expect(h.withReauth).toHaveBeenCalledTimes(1);
    expect(h.del).toHaveBeenCalledWith("/users/me", {
      headers: { "x-reauth-token": "step-up-token" },
    });
    expect(h.logout).toHaveBeenCalled();
  });

  it("stays signed in and silent when the user closes the step-up", async () => {
    h.withReauth.mockRejectedValue(
      Object.assign(new Error("reauth_cancelled"), { name: "AbortError" }),
    );
    act(() => del.mutate());
    await flush();

    expect(h.del).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.logout).not.toHaveBeenCalled();
  });

  it("shows a step-up refusal without signing out", async () => {
    h.del.mockRejectedValue({
      response: {
        status: 403,
        data: { errorCode: "REAUTH_FAILED", message: "server:403" },
      },
    });
    act(() => del.mutate());
    await flush();

    expect(h.toast.error).toHaveBeenCalledWith("server:403");
    expect(h.logout).not.toHaveBeenCalled();
  });
});

describe("e-mail change request", () => {
  it("sends the step-up token in the body", async () => {
    act(() => email.sendCode.mutate("new@example.com"));
    await flush();

    expect(h.post).toHaveBeenCalledWith("/auth/email/request-change", {
      newEmail: "new@example.com",
      reauthToken: "step-up-token",
    });
  });

  it("verifies the code without a second step-up", async () => {
    act(() => email.verify.mutate("123456"));
    await flush();
    expect(h.withReauth).not.toHaveBeenCalled();
    expect(h.post).toHaveBeenCalledWith("/auth/email/verify-change", {
      code: "123456",
    });
  });
});
