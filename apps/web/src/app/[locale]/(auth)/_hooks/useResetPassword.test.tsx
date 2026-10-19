// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  post: vi.fn(),
  logout: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=reset-token"),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("react-hot-toast", () => ({
  default: { success: h.toastSuccess, error: h.toastError },
}));
vi.mock("@/lib/api", () => ({ api: { post: h.post } }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: { logout: () => Promise<void> }) => unknown) =>
    select({ logout: h.logout }),
}));

import { useResetPassword } from "./useResetPassword";

let container: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof useResetPassword>;

function Harness() {
  result = useResetPassword();
  return null;
}

function render() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
}

async function submit(password: string) {
  let error: string | null = null;
  await act(async () => {
    error = await result.submit(password);
  });
  return error;
}

beforeEach(() => {
  h.post.mockReset().mockResolvedValue({ data: {} });
  h.logout.mockReset().mockResolvedValue(undefined);
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useResetPassword", () => {
  it("clears the session before showing the success view", async () => {
    let successDuringLogout: boolean | undefined;
    h.logout.mockImplementation(async () => {
      // Let React flush anything the hook may have queued before awaiting.
      await new Promise((resolve) => setTimeout(resolve, 0));
      successDuringLogout = result.success;
    });
    render();

    expect(await submit("N3w-password!")).toBeNull();

    expect(h.post).toHaveBeenCalledWith("/auth/reset-password", {
      token: "reset-token",
      newPassword: "N3w-password!",
    });
    expect(h.logout).toHaveBeenCalledTimes(1);
    // Cleared first, so the success view's login link is not bounced home.
    expect(h.logout.mock.invocationCallOrder[0]).toBeLessThan(
      h.toastSuccess.mock.invocationCallOrder[0],
    );
    expect(successDuringLogout).toBe(false);
    expect(result.success).toBe(true);
  });

  it("keeps the session when the reset fails", async () => {
    h.post.mockRejectedValue({
      response: { data: { message: "Token expired" } },
    });
    render();

    expect(await submit("N3w-password!")).toBe("Token expired");

    expect(h.logout).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith("Token expired");
    expect(result.success).toBe(false);
  });
});
