// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInMethods } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getMethods: vi.fn(),
  setPassword: vi.fn(),
  withReauth: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${JSON.stringify(values)}` : key,
}));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/api", () => ({
  api: { get: h.get, post: h.post },
  signInMethodsApi: { get: h.getMethods, setPassword: h.setPassword },
}));
vi.mock("@/stores/authStore", () => {
  const state = {
    user: { isPhoneVerified: true },
    isAuthenticated: true,
    refreshUser: vi.fn(),
  };
  return {
    useAuthStore: (select?: (s: unknown) => unknown) =>
      select ? select(state) : state,
  };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("../_modals/PhoneVerificationModal", () => ({ default: () => null }));

import { ReauthContext } from "../_hooks/useReauth";
import SecuritySection from "./SecuritySection";

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

async function render(methods: SignInMethods) {
  h.getMethods.mockResolvedValue({ data: methods });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <ReauthContext.Provider value={h.withReauth}>
          <SecuritySection />
        </ReauthContext.Provider>
      </QueryClientProvider>,
    ),
  );
  await flush();
}

const input = (name: string) =>
  container.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;

async function type(name: string, value: string) {
  const el = input(name)!;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const button = container.querySelector(
    'form button[type="submit"]',
  ) as HTMLButtonElement;
  await act(async () => {
    button.click();
  });
  await flush();
}

beforeEach(() => {
  for (const fn of [h.get, h.post, h.getMethods, h.setPassword]) fn.mockReset();
  h.get.mockResolvedValue({ data: { isEnabled: false } });
  h.post.mockResolvedValue({ data: {} });
  h.withReauth
    .mockReset()
    .mockImplementation(
      async (request: (token: string) => Promise<{ data: unknown }>) =>
        (await request("step-up-token")).data,
    );
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
});

describe("SecuritySection: password mode", () => {
  it("shows Change password for an account with a password", async () => {
    await render({ hasPassword: true, providers: [] });
    expect(input("currentPassword")).not.toBeNull();
    expect(container.textContent).toContain("profile.security.changePassword");
    expect(container.textContent).not.toContain(
      "profile.security.setPasswordTitle",
    );
  });

  it("sends the current password as typed (no trim)", async () => {
    await render({ hasPassword: true, providers: [] });
    await type("currentPassword", " old pass ");
    await type("newPassword", "NewPass123");
    await type("confirmPassword", "NewPass123");
    await submit();

    expect(h.post).toHaveBeenCalledWith("/security/password/change", {
      currentPassword: " old pass ",
      newPassword: "NewPass123",
    });
    expect(h.withReauth).not.toHaveBeenCalled();
  });

  it("shows Set a password for an account without one, with no current password field", async () => {
    await render({
      hasPassword: false,
      providers: [
        { provider: "google", email: null, linkedAt: "2026-10-01T00:00:00Z" },
      ],
    });
    expect(input("currentPassword")).toBeNull();
    expect(container.textContent).toContain(
      "profile.security.setPasswordTitle",
    );
    expect(container.textContent).toContain(
      "profile.security.setPasswordIntro",
    );
    expect(container.textContent).toContain(
      "profile.security.setPasswordAction",
    );
  });

  it("sets the password behind the step-up and turns into Change password without a reload", async () => {
    h.setPassword.mockResolvedValue({
      data: {
        hasPassword: true,
        providers: [
          { provider: "google", email: null, linkedAt: "2026-10-01T00:00:00Z" },
        ],
      },
    });
    await render({ hasPassword: false, providers: [] });
    await type("newPassword", "NewPass123");
    await type("confirmPassword", "NewPass123");
    await submit();

    expect(h.withReauth).toHaveBeenCalledTimes(1);
    expect(h.setPassword).toHaveBeenCalledWith({
      newPassword: "NewPass123",
      reauthToken: "step-up-token",
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      "profile.security.setPasswordSuccess",
    );
    expect(input("currentPassword")).not.toBeNull();
    expect(h.getMethods).toHaveBeenCalledTimes(1);
  });

  it("does not call the API when the new password breaks the shared policy", async () => {
    await render({ hasPassword: false, providers: [] });
    await type("newPassword", "short");
    await type("confirmPassword", "short");
    await submit();
    expect(h.withReauth).not.toHaveBeenCalled();
    expect(h.setPassword).not.toHaveBeenCalled();
  });

  it("refetches on 409 PASSWORD_ALREADY_SET (another tab set one)", async () => {
    h.setPassword.mockRejectedValue({
      response: {
        status: 409,
        data: { errorCode: "PASSWORD_ALREADY_SET", message: "server:409" },
      },
    });
    await render({ hasPassword: false, providers: [] });
    h.getMethods.mockResolvedValue({
      data: { hasPassword: true, providers: [] },
    });
    await type("newPassword", "NewPass123");
    await type("confirmPassword", "NewPass123");
    await submit();

    expect(h.toast.error).toHaveBeenCalledWith("server:409");
    expect(h.getMethods).toHaveBeenCalledTimes(2);
    expect(input("currentPassword")).not.toBeNull();
  });
});
