// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ logoutAction: vi.fn() }));

vi.mock("@/lib/api", () => ({ authApi: {}, userApi: {} }));
vi.mock("@/lib/server/auth-actions", () => ({
  loginAction: vi.fn(),
  googleLoginAction: vi.fn(),
  appleLoginAction: vi.fn(),
  logoutAction: h.logoutAction,
}));
vi.mock("@/lib/query/getQueryClient", () => ({ getQueryClient: vi.fn() }));
vi.mock("@/lib/wishlist", () => ({
  forgetWishlistOnUserChange: () => () => undefined,
}));

import { useAuthStore } from "./authStore";

const signedIn = () =>
  useAuthStore.setState({
    user: { id: "u1" } as never,
    isAuthenticated: true,
  });

afterEach(() => {
  vi.restoreAllMocks();
  h.logoutAction.mockReset();
});

describe("authStore.logout", () => {
  it("resets the session even when site storage is blocked", async () => {
    signedIn();
    h.logoutAction.mockResolvedValue(undefined);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();

    expect(h.logoutAction).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
    });
  });

  it("resets the session when the server action fails", async () => {
    signedIn();
    h.logoutAction.mockRejectedValue(new Error("network"));

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
