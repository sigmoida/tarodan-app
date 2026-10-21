// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The 2FA page sends an account without a password to set one first. */

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getMethods: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/api", () => {
  const api = { get: h.get, post: h.post };
  return { default: api, api, signInMethodsApi: { get: h.getMethods } };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({}),
}));

import SecuritySettingsPage from "./page";

let container: HTMLDivElement;
let root: Root;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

async function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <SecuritySettingsPage />
      </QueryClientProvider>,
    ),
  );
  await flush();
}

beforeEach(() => {
  h.get.mockReset().mockResolvedValue({ data: { isEnabled: false } });
  h.post.mockReset();
  h.getMethods.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("2FA page", () => {
  it("shows the set-a-password hint, with a link, for an account without a password", async () => {
    h.getMethods.mockResolvedValue({
      data: { hasPassword: false, providers: [] },
    });
    await render();

    expect(container.textContent).toContain(
      "profile.security.passwordFirstFor2fa",
    );
    expect(
      container.querySelector('a[href="/profile#password"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("profile.twoFactor.startSetup");
  });

  it("offers the setup for an account with a password", async () => {
    h.getMethods.mockResolvedValue({
      data: { hasPassword: true, providers: [] },
    });
    await render();
    expect(container.textContent).toContain("profile.twoFactor.startSetup");
    expect(container.textContent).not.toContain("passwordFirstFor2fa");
  });

  it("turns the API's no-password refusal into the hint, not the raw error", async () => {
    h.getMethods.mockRejectedValue(new Error("network"));
    h.post.mockRejectedValue({
      response: {
        status: 400,
        data: {
          i18nKey: "server.security.passwordRequiredFor2fa",
          message: "raw server text",
        },
      },
    });
    await render();

    const start = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("profile.twoFactor.startSetup"),
    )!;
    await act(async () => {
      start.click();
    });
    await flush();

    expect(container.textContent).toContain(
      "profile.security.passwordFirstFor2fa",
    );
    expect(container.textContent).not.toContain("raw server text");
  });
});
