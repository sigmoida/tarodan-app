// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Identifier-first login steps. An account without a password gets the
 * provider-neutral step with Google, Apple and the set-password mail
 * (sign-in methods plan, D5); an account with one gets the password step.
 */

const h = vi.hoisted(() => ({
  checkEmail: vi.fn(),
  forgotPassword: vi.fn(),
  submit: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl")>()),
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/api", () => ({
  authApi: { checkEmail: h.checkEmail, forgotPassword: h.forgotPassword },
}));
vi.mock("../_hooks/useLogin", () => ({
  useLogin: () => ({
    submit: h.submit,
    requires2FA: false,
    isLoading: false,
    showVerificationBanner: false,
    resendVerification: vi.fn(),
    isResending: false,
    redirectAfterGoogle: vi.fn(),
    resetTwoFactor: vi.fn(),
  }),
}));
// The buttons have their own tests; here only which step shows them.
vi.mock("./GoogleSignInButton", () => ({
  GoogleSignInButton: () => <button type="button">google-button</button>,
}));
vi.mock("./AppleSignInButton", () => ({
  AppleSignInButton: () => <button type="button">apple-button</button>,
}));

import { LoginForm } from "./LoginForm";

let container: HTMLDivElement;
let root: Root;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

const text = () => container.textContent ?? "";

async function identify(email: string) {
  const input = container.querySelector(
    'input[name="email"]',
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(input, email);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const submit = container.querySelector(
    'button[type="submit"]',
  ) as HTMLButtonElement;
  await act(async () => submit.click());
  await flush();
}

beforeEach(() => {
  for (const fn of [
    h.checkEmail,
    h.forgotPassword,
    h.submit,
    h.toast.success,
    h.toast.error,
  ]) {
    fn.mockReset();
  }
  h.forgotPassword.mockResolvedValue({ data: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <LoginForm />
      </QueryClientProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("LoginForm steps", () => {
  it("offers Google and Apple next to the e-mail on the first step", () => {
    expect(text()).toContain("google-button");
    expect(text()).toContain("apple-button");
    expect(container.querySelector('input[name="email"]')).not.toBeNull();
  });

  it("asks for the password when the account has one", async () => {
    h.checkEmail.mockResolvedValue({
      data: { exists: true, hasPassword: true },
    });
    await identify("member@example.com");

    expect(h.checkEmail).toHaveBeenCalledWith("member@example.com");
    expect(container.querySelector('input[name="password"]')).not.toBeNull();
    expect(text()).not.toContain("auth.noPasswordAccount");
    expect(text()).not.toContain("google-button");
  });

  it("shows the provider-neutral step with Google, Apple and the set-password mail without one", async () => {
    h.checkEmail.mockResolvedValue({
      data: { exists: true, hasPassword: false },
    });
    await identify("social@example.com");

    expect(container.querySelector('input[name="password"]')).toBeNull();
    expect(text()).toContain("auth.noPasswordAccount");
    expect(text()).not.toContain("auth.googleOnlyAccount");
    expect(text()).toContain("google-button");
    expect(text()).toContain("apple-button");

    const setPassword = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("auth.setPassword"),
    )!;
    await act(async () => setPassword.click());
    await flush();
    expect(h.forgotPassword).toHaveBeenCalledWith("social@example.com");
    expect(h.toast.success).toHaveBeenCalledWith("auth.setPasswordEmailSent");
  });

  it("shows the sign-up hint for an unknown e-mail", async () => {
    h.checkEmail.mockResolvedValue({ data: { exists: false } });
    await identify("new@example.com");
    expect(text()).toContain("auth.emailNotRegistered");
    expect(container.querySelector('input[name="email"]')).not.toBeNull();
  });
});
