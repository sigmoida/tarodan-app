// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInMethods } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  getMethods: vi.fn(),
  linkGoogle: vi.fn(),
  linkApple: vi.fn(),
  unlink: vi.fn(),
  request: vi.fn(),
  confirm: vi.fn(),
  logout: vi.fn(),
  withReauth: vi.fn(),
  available: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${JSON.stringify(values)}` : key,
}));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/api", () => ({
  signInMethodsApi: {
    get: h.getMethods,
    linkGoogle: h.linkGoogle,
    linkApple: h.linkApple,
    unlink: h.unlink,
  },
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({ isAuthenticated: true, logout: h.logout }),
}));
vi.mock("@/components/ConfirmProvider", () => ({
  useConfirm: () => h.confirm,
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

import { ReauthContext } from "../_hooks/useReauth";
import ConnectedAccountsSection from "./ConnectedAccountsSection";

const google = {
  provider: "google" as const,
  email: "g@example.com",
  linkedAt: "2026-10-01T00:00:00Z",
};
const apple = {
  provider: "apple" as const,
  email: null,
  linkedAt: "2026-10-02T00:00:00Z",
};

const apiError = (status: number, errorCode: string) => ({
  response: { status, data: { errorCode, message: `server:${errorCode}` } },
});

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ReauthContext.Provider value={h.withReauth}>
        {children}
      </ReauthContext.Provider>
    </QueryClientProvider>
  );
}

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
      <Providers>
        <ConnectedAccountsSection />
      </Providers>,
    ),
  );
  await flush();
}

const row = (provider: string) =>
  container.querySelector(`[data-provider="${provider}"]`) as HTMLElement;
const rowButton = (provider: string) =>
  row(provider).querySelector("button") as HTMLButtonElement;

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await flush();
}

beforeEach(() => {
  for (const fn of [
    h.getMethods,
    h.linkGoogle,
    h.linkApple,
    h.unlink,
    h.request,
    h.confirm,
    h.logout,
    h.toast.success,
    h.toast.error,
  ]) {
    fn.mockReset();
  }
  h.withReauth
    .mockReset()
    .mockImplementation((action: (token: string) => unknown) =>
      action("step-up-token"),
    );
  h.available = new Set(["google", "apple"]);
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

describe("ConnectedAccountsSection: rows", () => {
  it("shows Connect for a provider that is not linked and Disconnect for one that is", async () => {
    await render({ hasPassword: true, providers: [google] });

    expect(row("google").textContent).toContain(
      "profile.connectedAccounts.connected",
    );
    expect(row("google").textContent).toContain(
      'profile.connectedAccounts.connectedAs|{"email":"g@example.com"}',
    );
    expect(rowButton("google").textContent).toContain(
      "profile.connectedAccounts.disconnect",
    );
    expect(rowButton("google").disabled).toBe(false);

    expect(row("apple").textContent).toContain(
      "profile.connectedAccounts.notConnected",
    );
    expect(rowButton("apple").textContent).toContain(
      "profile.connectedAccounts.connect",
    );
  });

  it("hides Connect for a provider this site cannot offer, but keeps a linked one", async () => {
    h.available = new Set(["google"]);
    await render({ hasPassword: true, providers: [] });
    expect(row("apple")).toBeNull();

    act(() => root.unmount());
    root = createRoot(container);
    await render({ hasPassword: true, providers: [apple] });
    expect(row("apple")).not.toBeNull();
  });
});

describe("ConnectedAccountsSection: last-method rule (D1)", () => {
  it.each<[string, SignInMethods, string]>([
    [
      "Apple alone without a password",
      { hasPassword: false, providers: [apple] },
      "apple",
    ],
    [
      "Google alone without a password",
      { hasPassword: false, providers: [google] },
      "google",
    ],
    [
      "Google when only Apple would remain",
      { hasPassword: false, providers: [google, apple] },
      "google",
    ],
  ])("disables Disconnect with the hint: %s", async (_, methods, provider) => {
    await render(methods);
    expect(rowButton(provider).disabled).toBe(true);
    expect(row(provider).textContent).toContain(
      "profile.connectedAccounts.lastMethodHint",
    );
  });

  it("allows Disconnect of Apple when Google stays, and of either with a password", async () => {
    await render({ hasPassword: false, providers: [google, apple] });
    expect(rowButton("apple").disabled).toBe(false);
    expect(row("apple").textContent).not.toContain("lastMethodHint");

    act(() => root.unmount());
    root = createRoot(container);
    await render({ hasPassword: true, providers: [google, apple] });
    expect(rowButton("google").disabled).toBe(false);
    expect(rowButton("apple").disabled).toBe(false);
  });
});

describe("ConnectedAccountsSection: disconnect", () => {
  it("confirms with the re-link note, then unlinks behind the step-up", async () => {
    h.confirm.mockResolvedValue(true);
    h.unlink.mockResolvedValue({
      data: { hasPassword: true, providers: [] },
    });
    await render({ hasPassword: true, providers: [google] });

    await click(rowButton("google"));

    const options = h.confirm.mock.calls[0][0];
    expect(options.title).toBe(
      'profile.connectedAccounts.disconnectTitle|{"provider":"Google"}',
    );
    expect(options.destructive).toBe(true);
    // The description renders both paragraphs: the confirm and the D2 note.
    const host = document.createElement("div");
    const descRoot = createRoot(host);
    act(() => descRoot.render(options.description));
    expect(host.textContent).toContain(
      'profile.connectedAccounts.disconnectConfirm|{"provider":"Google"}',
    );
    expect(host.textContent).toContain(
      'profile.connectedAccounts.relinkNote|{"provider":"Google"}',
    );
    act(() => descRoot.unmount());

    expect(h.withReauth).toHaveBeenCalledTimes(1);
    expect(h.unlink).toHaveBeenCalledWith("google", {
      reauthToken: "step-up-token",
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      'profile.connectedAccounts.disconnectSuccess|{"provider":"Google"}',
    );
    // The answer is the new state: the row flips without a refetch.
    expect(h.getMethods).toHaveBeenCalledTimes(1);
    expect(rowButton("google").textContent).toContain(
      "profile.connectedAccounts.connect",
    );
  });

  it("does nothing when the confirmation is declined", async () => {
    h.confirm.mockResolvedValue(false);
    await render({ hasPassword: true, providers: [google] });
    await click(rowButton("google"));
    expect(h.withReauth).not.toHaveBeenCalled();
    expect(h.unlink).not.toHaveBeenCalled();
  });

  it("on a 409 LAST_SIGN_IN_METHOD race shows the hint text and refetches, so Disconnect turns off", async () => {
    h.confirm.mockResolvedValue(true);
    h.unlink.mockRejectedValue(apiError(409, "LAST_SIGN_IN_METHOD"));
    await render({ hasPassword: true, providers: [google] });
    // Meanwhile the password was removed elsewhere: the refetch says so.
    h.getMethods.mockResolvedValue({
      data: { hasPassword: false, providers: [google] },
    });

    await click(rowButton("google"));

    expect(h.toast.error).toHaveBeenCalledWith("server:LAST_SIGN_IN_METHOD");
    expect(h.getMethods).toHaveBeenCalledTimes(2);
    expect(rowButton("google").disabled).toBe(true);
    expect(row("google").textContent).toContain(
      "profile.connectedAccounts.lastMethodHint",
    );
    expect(h.logout).not.toHaveBeenCalled();
  });

  it("shows no error when the user closes the step-up", async () => {
    h.confirm.mockResolvedValue(true);
    const cancelled = Object.assign(new Error("reauth_cancelled"), {
      name: "AbortError",
    });
    h.withReauth.mockRejectedValue(cancelled);
    await render({ hasPassword: true, providers: [google] });
    await click(rowButton("google"));
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});

describe("ConnectedAccountsSection: connect", () => {
  it("asks Google first, then links its code with the step-up token", async () => {
    h.request.mockResolvedValue({ provider: "google", code: "auth-code" });
    h.linkGoogle.mockResolvedValue({
      data: { hasPassword: true, providers: [google] },
    });
    await render({ hasPassword: true, providers: [] });

    await click(rowButton("google"));

    expect(h.request).toHaveBeenCalledWith("google");
    expect(h.linkGoogle).toHaveBeenCalledWith({
      code: "auth-code",
      reauthToken: "step-up-token",
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      'profile.connectedAccounts.connectSuccess|{"provider":"Google"}',
    );
    expect(rowButton("google").textContent).toContain(
      "profile.connectedAccounts.disconnect",
    );
  });

  it("links Apple with its identity token and no authorization code (web)", async () => {
    h.request.mockResolvedValue({ provider: "apple", identityToken: "jwt" });
    h.linkApple.mockResolvedValue({
      data: { hasPassword: true, providers: [apple] },
    });
    await render({ hasPassword: true, providers: [] });

    await click(rowButton("apple"));

    expect(h.linkApple).toHaveBeenCalledWith({
      identityToken: "jwt",
      reauthToken: "step-up-token",
    });
  });

  it("skips the step-up when the popup is closed", async () => {
    h.request.mockResolvedValue(null);
    await render({ hasPassword: true, providers: [] });
    await click(rowButton("google"));
    expect(h.withReauth).not.toHaveBeenCalled();
    expect(h.linkGoogle).not.toHaveBeenCalled();
  });

  it.each([
    [
      "409 PROVIDER_LINKED_TO_OTHER_ACCOUNT",
      apiError(409, "PROVIDER_LINKED_TO_OTHER_ACCOUNT"),
      1,
    ],
    [
      "409 PROVIDER_ALREADY_LINKED (stale list)",
      apiError(409, "PROVIDER_ALREADY_LINKED"),
      2,
    ],
    ["400 PROVIDER_TOKEN_INVALID", apiError(400, "PROVIDER_TOKEN_INVALID"), 1],
    ["403 REAUTH_FAILED", apiError(403, "REAUTH_FAILED"), 1],
  ])(
    "shows the server message on %s and never signs out",
    async (_, error, fetches) => {
      h.request.mockResolvedValue({ provider: "google", code: "auth-code" });
      h.linkGoogle.mockRejectedValue(error);
      await render({ hasPassword: true, providers: [] });

      await click(rowButton("google"));

      expect(h.toast.error).toHaveBeenCalledWith(
        `server:${error.response.data.errorCode}`,
      );
      expect(h.getMethods).toHaveBeenCalledTimes(fetches);
      expect(h.logout).not.toHaveBeenCalled();
    },
  );

  it("maps a failed provider popup to its own message", async () => {
    const { AppleCredentialError } =
      await import("@/components/auth/useAppleCredential");
    h.request.mockRejectedValue(new AppleCredentialError("script"));
    await render({ hasPassword: true, providers: [] });
    await click(rowButton("apple"));
    expect(h.toast.error).toHaveBeenCalledWith("auth.appleScriptFailed");
    expect(h.withReauth).not.toHaveBeenCalled();
  });
});
