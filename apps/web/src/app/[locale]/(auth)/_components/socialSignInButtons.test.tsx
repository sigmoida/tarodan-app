// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The login buttons after the credential step moved into the shared hooks
 * (sign-in methods plan T11): the same popup, the same store call, the same
 * messages as before the extraction.
 */

type GoogleConfig = {
  flow: string;
  select_account?: boolean;
  onSuccess: (r: { code: string }) => void;
  onError: () => void;
  onNonOAuthError: () => void;
};

const h = vi.hoisted(() => {
  // Read once at module load by useAppleCredential.
  process.env.NEXT_PUBLIC_APPLE_SERVICES_ID = "test.services.id";
  process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI = "https://example.test/login";
  return {
    config: null as GoogleConfig | null,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    loginWithApple: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
  };
});

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@react-oauth/google", () => ({
  useGoogleOAuth: () => ({ scriptLoadedSuccessfully: true }),
  useGoogleLogin: (config: GoogleConfig) => {
    h.config = config;
    return h.login;
  },
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({
      loginWithGoogle: h.loginWithGoogle,
      loginWithApple: h.loginWithApple,
    }),
}));

import { GoogleSignInButton } from "./GoogleSignInButton";
import { AppleSignInButton } from "./AppleSignInButton";

let container: HTMLDivElement;
let root: Root;
const onSuccess = vi.fn();

const flush = () =>
  act(async () => {
    for (let i = 0; i < 3; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

const button = () => container.querySelector("button") as HTMLButtonElement;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "test-client-id");
  h.config = null;
  for (const fn of [
    h.login,
    h.loginWithGoogle,
    h.loginWithApple,
    h.toast.success,
    h.toast.error,
    onSuccess,
  ]) {
    fn.mockReset();
  }
  h.loginWithGoogle.mockResolvedValue(undefined);
  h.loginWithApple.mockResolvedValue(undefined);
  delete window.AppleID;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
  delete window.AppleID;
});

describe("GoogleSignInButton (login)", () => {
  it("opens the auth-code popup inside the click and signs in with the code", async () => {
    render(<GoogleSignInButton onSuccess={onSuccess} />);
    expect(h.config?.flow).toBe("auth-code");
    // Login keeps Google's default: no forced account chooser.
    expect(h.config?.select_account).toBe(false);

    act(() => button().click());
    expect(h.login).toHaveBeenCalledTimes(1);

    await act(async () => h.config!.onSuccess({ code: "auth-code" }));
    await flush();

    expect(h.loginWithGoogle).toHaveBeenCalledWith("auth-code");
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("does nothing when the popup is closed, and the button is usable again", async () => {
    render(<GoogleSignInButton onSuccess={onSuccess} />);
    act(() => button().click());
    await act(async () => h.config!.onNonOAuthError());
    await flush();

    expect(h.loginWithGoogle).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });

  it("shows the generic message on a Google OAuth error", async () => {
    render(<GoogleSignInButton onSuccess={onSuccess} />);
    act(() => button().click());
    await act(async () => h.config!.onError());
    await flush();

    expect(h.toast.error).toHaveBeenCalledWith("auth.googleSignInFailed");
    expect(h.loginWithGoogle).not.toHaveBeenCalled();
  });

  it("shows the API's message when the sign-in itself fails", async () => {
    h.loginWithGoogle.mockRejectedValue(new Error("server message"));
    render(<GoogleSignInButton onSuccess={onSuccess} />);
    act(() => button().click());
    await act(async () => h.config!.onSuccess({ code: "auth-code" }));
    await flush();

    expect(h.toast.error).toHaveBeenCalledWith("server message");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("renders nothing without a Google client id", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    render(<GoogleSignInButton onSuccess={onSuccess} />);
    expect(button()).toBeNull();
  });
});

describe("AppleSignInButton (login)", () => {
  it("signs in with the identity token and the first-time name", async () => {
    const init = vi.fn();
    window.AppleID = {
      auth: {
        init,
        signIn: vi.fn().mockResolvedValue({
          authorization: { id_token: "apple-jwt" },
          user: { name: { firstName: "Ada", lastName: "Lovelace" } },
        }),
      },
    };
    render(<AppleSignInButton onSuccess={onSuccess} />);

    await act(async () => button().click());
    await flush();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ usePopup: true }),
    );
    expect(h.loginWithApple).toHaveBeenCalledWith("apple-jwt", "Ada Lovelace");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows the script message when Apple's SDK is not loaded", async () => {
    render(<AppleSignInButton onSuccess={onSuccess} />);
    await act(async () => button().click());
    await flush();

    expect(h.toast.error).toHaveBeenCalledWith("auth.appleScriptFailed");
    expect(h.loginWithApple).not.toHaveBeenCalled();
  });

  it("does nothing when the user closes the popup", async () => {
    window.AppleID = {
      auth: {
        init: vi.fn(),
        signIn: vi.fn().mockRejectedValue({ error: "popup_closed_by_user" }),
      },
    };
    render(<AppleSignInButton onSuccess={onSuccess} />);
    await act(async () => button().click());
    await flush();

    expect(h.loginWithApple).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });

  it("shows the API's message when the sign-in itself fails", async () => {
    window.AppleID = {
      auth: {
        init: vi.fn(),
        signIn: vi
          .fn()
          .mockResolvedValue({ authorization: { id_token: "apple-jwt" } }),
      },
    };
    h.loginWithApple.mockRejectedValue(new Error("server message"));
    render(<AppleSignInButton onSuccess={onSuccess} />);
    await act(async () => button().click());
    await flush();

    expect(h.loginWithApple).toHaveBeenCalledWith("apple-jwt", undefined);
    expect(h.toast.error).toHaveBeenCalledWith("server message");
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
