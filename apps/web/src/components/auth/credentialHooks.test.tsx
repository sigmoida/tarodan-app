// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The shared Google and Apple credential steps (login, step-up, Connected
 * accounts use the same implementation).
 */

type GoogleConfig = {
  flow: string;
  select_account?: boolean;
  onSuccess: (r: { code: string }) => void;
  onError: () => void;
  onNonOAuthError: () => void;
};

const h = vi.hoisted(() => ({
  config: null as GoogleConfig | null,
  login: vi.fn(),
}));

vi.mock("@react-oauth/google", () => ({
  useGoogleLogin: (config: GoogleConfig) => {
    h.config = config;
    return h.login;
  },
}));

import { GoogleAuthCodeError, useGoogleAuthCode } from "./useGoogleAuthCode";
import { AppleCredentialError, useAppleCredential } from "./useAppleCredential";

let container: HTMLDivElement;
let root: Root;
let google: ReturnType<typeof useGoogleAuthCode>;
let apple: ReturnType<typeof useAppleCredential>;

function Harness({ selectAccount }: { selectAccount?: boolean }) {
  google = useGoogleAuthCode({ selectAccount });
  apple = useAppleCredential();
  return null;
}

function render(selectAccount?: boolean) {
  act(() => root.render(<Harness selectAccount={selectAccount} />));
}

beforeEach(() => {
  h.config = null;
  h.login.mockReset();
  delete window.AppleID;
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  delete window.AppleID;
});

describe("useGoogleAuthCode", () => {
  it("uses the auth-code popup; the chooser only when asked", () => {
    render();
    expect(h.config?.flow).toBe("auth-code");
    expect(h.config?.select_account).toBe(false);
    render(true);
    expect(h.config?.select_account).toBe(true);
  });

  it("opens the popup synchronously and resolves with the code", async () => {
    render();
    const pending = google.requestCode();
    // Popup rules: login() must run inside the click, before any await.
    expect(h.login).toHaveBeenCalledTimes(1);
    h.config!.onSuccess({ code: "auth-code" });
    await expect(pending).resolves.toBe("auth-code");
  });

  it("resolves null when the popup is closed or blocked", async () => {
    render();
    const pending = google.requestCode();
    h.config!.onNonOAuthError();
    await expect(pending).resolves.toBeNull();
  });

  it("rejects with GoogleAuthCodeError on an OAuth error", async () => {
    render();
    const pending = google.requestCode();
    h.config!.onError();
    await expect(pending).rejects.toBeInstanceOf(GoogleAuthCodeError);
  });

  it("a second request supersedes a pending one", async () => {
    render();
    const first = google.requestCode();
    const second = google.requestCode();
    h.config!.onSuccess({ code: "second-code" });
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBe("second-code");
  });
});

describe("useAppleCredential", () => {
  it("rejects with reason 'script' when the SDK is not loaded", async () => {
    render();
    await expect(apple.requestCredential()).rejects.toMatchObject({
      reason: "script",
    });
  });

  it("returns the identity token and the first-time name, and no authorization code", async () => {
    const signIn = vi.fn().mockResolvedValue({
      authorization: { id_token: "jwt", code: "apple-code" },
      user: { name: { firstName: "Ada", lastName: "Lovelace" } },
    });
    window.AppleID = { auth: { init: vi.fn(), signIn } };
    render();

    await expect(apple.requestCredential()).resolves.toEqual({
      identityToken: "jwt",
      fullName: "Ada Lovelace",
    });
  });

  it("resolves null when the user closes the popup", async () => {
    window.AppleID = {
      auth: {
        init: vi.fn(),
        signIn: vi.fn().mockRejectedValue({ error: "popup_closed_by_user" }),
      },
    };
    render();
    await expect(apple.requestCredential()).resolves.toBeNull();
  });

  it("rejects with reason 'failed' without an id_token or on an SDK error", async () => {
    window.AppleID = {
      auth: { init: vi.fn(), signIn: vi.fn().mockResolvedValue({}) },
    };
    render();
    const error = await apple.requestCredential().catch((e) => e);
    expect(error).toBeInstanceOf(AppleCredentialError);
    expect(error.reason).toBe("failed");

    window.AppleID.auth.signIn = vi
      .fn()
      .mockRejectedValue({ error: "invalid_client" });
    await expect(apple.requestCredential()).rejects.toMatchObject({
      reason: "failed",
    });
  });
});
