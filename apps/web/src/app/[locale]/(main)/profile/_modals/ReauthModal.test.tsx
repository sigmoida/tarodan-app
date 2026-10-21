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
  getMethods: vi.fn(),
  reauth: vi.fn(),
  forgotPassword: vi.fn(),
  logout: vi.fn(),
  request: vi.fn(),
  available: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${JSON.stringify(values)}` : key,
}));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/api", () => ({
  signInMethodsApi: { get: h.getMethods, reauth: h.reauth },
  authApi: { forgotPassword: h.forgotPassword },
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({ user: { email: "member@example.com" }, logout: h.logout }),
}));
vi.mock("@/components/auth/useProviderCredential", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/auth/useProviderCredential")
  >()),
  useProviderCredential: () => ({
    isAvailable: (provider: string) => h.available.has(provider),
    request: h.request,
  }),
}));

import ReauthModal from "./ReauthModal";

const PASSWORD_ACCOUNT: SignInMethods = { hasPassword: true, providers: [] };
const SOCIAL_ONLY: SignInMethods = {
  hasPassword: false,
  providers: [
    {
      provider: "google",
      email: "g@example.com",
      linkedAt: "2026-10-01T00:00:00Z",
    },
    { provider: "apple", email: null, linkedAt: "2026-10-02T00:00:00Z" },
  ],
};
const RESPONSE = {
  reauthToken: "secret-step-up-token",
  expiresAt: "2026-10-21T10:05:00.000Z",
};

const apiError = (status: number, errorCode: string) => ({
  response: { status, data: { errorCode, message: `server:${errorCode}` } },
});

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const onConfirmed = vi.fn();
const onCancel = vi.fn();

function render(open = true) {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <ReauthModal
          open={open}
          onConfirmed={onConfirmed}
          onCancel={onCancel}
        />
      </QueryClientProvider>,
    ),
  );
}

/** Lets queries, mutations and their callbacks settle. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
const dialog = () => document.body.querySelector('[role="dialog"]');
const text = () => dialog()?.textContent ?? "";

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.body.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(label),
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found as HTMLButtonElement;
}

async function typePassword(value: string) {
  const input = document.body.querySelector(
    'input[type="password"]',
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await flush();
}

beforeEach(() => {
  h.getMethods.mockReset();
  h.reauth.mockReset();
  h.forgotPassword.mockReset().mockResolvedValue({ data: {} });
  h.logout.mockReset();
  h.request.mockReset();
  h.available = new Set(["google", "apple"]);
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  onConfirmed.mockReset();
  onCancel.mockReset();
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

describe("ReauthModal: account with a password", () => {
  beforeEach(() => {
    h.getMethods.mockResolvedValue({ data: PASSWORD_ACCOUNT });
  });

  it("confirms with the password as typed and hands the token to the caller", async () => {
    h.reauth.mockResolvedValue({ data: RESPONSE });
    render();
    await flush();

    expect(text()).toContain("auth.reauth.title");
    expect(text()).toContain("auth.reauth.withPassword");
    expect(text()).not.toContain("auth.reauth.withProvider");

    await typePassword("  pass word ");
    await click(button("common.confirm"));

    expect(h.reauth).toHaveBeenCalledWith({ password: "  pass word " });
    expect(onConfirmed).toHaveBeenCalledWith(RESPONSE);
  });

  it.each([
    ["403 REAUTH_FAILED", apiError(403, "REAUTH_FAILED")],
    ["429 REAUTH_LOCKED", apiError(429, "REAUTH_LOCKED")],
    ["503 REAUTH_UNAVAILABLE", apiError(503, "REAUTH_UNAVAILABLE")],
  ])("shows %s in the dialog and never signs out", async (_, error) => {
    h.reauth.mockRejectedValue(error);
    render();
    await flush();
    await typePassword("wrong");
    await click(button("common.confirm"));

    expect(text()).toContain(`server:${error.response.data.errorCode}`);
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(h.logout).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });

  it("refetches the methods on REAUTH_METHOD_NOT_ALLOWED (the variant on screen is stale)", async () => {
    h.reauth.mockRejectedValue(apiError(400, "REAUTH_METHOD_NOT_ALLOWED"));
    render();
    await flush();
    expect(h.getMethods).toHaveBeenCalledTimes(1);

    await typePassword("x");
    await click(button("common.confirm"));
    await flush();
    expect(h.getMethods).toHaveBeenCalledTimes(2);
  });

  it("keeps the token out of the query and mutation caches once closed", async () => {
    h.reauth.mockResolvedValue({ data: RESPONSE });
    render();
    await flush();
    await typePassword("right");
    await click(button("common.confirm"));
    expect(onConfirmed).toHaveBeenCalled();

    render(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const cached = JSON.stringify([
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
      client
        .getMutationCache()
        .getAll()
        .map((m) => m.state.data),
    ]);
    expect(cached).not.toContain(RESPONSE.reauthToken);
  });
});

describe("ReauthModal: account without a password", () => {
  beforeEach(() => {
    h.getMethods.mockResolvedValue({ data: SOCIAL_ONLY });
  });

  it("offers each linked provider that this site can show, and no password field", async () => {
    h.available = new Set(["google"]);
    render();
    await flush();

    expect(document.body.querySelector('input[type="password"]')).toBeNull();
    expect(text()).toContain('auth.reauth.withProvider|{"provider":"Google"}');
    expect(text()).not.toContain('{"provider":"Apple"}');
  });

  it("confirms with a fresh Google sign-in (code only)", async () => {
    h.request.mockResolvedValue({ provider: "google", code: "auth-code" });
    h.reauth.mockResolvedValue({ data: RESPONSE });
    render();
    await flush();

    await click(button('{"provider":"Google"}'));

    expect(h.request).toHaveBeenCalledWith("google");
    expect(h.reauth).toHaveBeenCalledWith({
      provider: "google",
      code: "auth-code",
    });
    expect(onConfirmed).toHaveBeenCalledWith(RESPONSE);
  });

  it("confirms with a fresh Apple sign-in (identity token)", async () => {
    h.request.mockResolvedValue({ provider: "apple", identityToken: "jwt" });
    h.reauth.mockResolvedValue({ data: RESPONSE });
    render();
    await flush();

    await click(button('{"provider":"Apple"}'));

    expect(h.reauth).toHaveBeenCalledWith({
      provider: "apple",
      identityToken: "jwt",
    });
  });

  it("does nothing when the user closes the provider popup", async () => {
    h.request.mockResolvedValue(null);
    render();
    await flush();
    await click(button('{"provider":"Google"}'));

    expect(h.reauth).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });

  it("cannot be closed while the provider popup is open", async () => {
    h.request.mockReturnValue(new Promise(() => {}));
    render();
    await flush();
    await click(button('{"provider":"Google"}'));

    expect(button("common.cancel").disabled).toBe(true);
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("falls back to the set-password mail when no linked provider can be shown", async () => {
    h.available = new Set();
    render();
    await flush();

    await click(button("auth.setPassword"));
    expect(h.forgotPassword).toHaveBeenCalledWith("member@example.com");
    expect(h.toast.success).toHaveBeenCalledWith("auth.setPasswordEmailSent");
  });
});
