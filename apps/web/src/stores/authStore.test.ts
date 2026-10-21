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
// One real client, like the browser singleton, so the store's session
// listener is exercised end to end.
vi.mock("@/lib/query/getQueryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const client = new QueryClient();
  return { getQueryClient: () => client };
});

import { getQueryClient } from "@/lib/query/getQueryClient";
import { useAuthStore } from "./authStore";

const signedIn = () =>
  useAuthStore.setState({
    user: { id: "u1" } as never,
    isAuthenticated: true,
  });

afterEach(() => {
  vi.restoreAllMocks();
  h.logoutAction.mockReset();
  useAuthStore.setState({ user: null, isAuthenticated: false });
  getQueryClient().clear();
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

describe("authStore query cache per session", () => {
  const key = ["notifications", "unread-count"];
  const seedCache = () => getQueryClient().setQueryData(key, 3);
  const cached = () => getQueryClient().getQueryData(key);

  it("clears the cache on logout", async () => {
    signedIn();
    seedCache();
    h.logoutAction.mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    expect(cached()).toBeUndefined();
  });

  it("clears the cache when another user signs in without a reload", () => {
    signedIn();
    seedCache();

    useAuthStore.getState().setUser({ id: "u2" } as never);

    expect(cached()).toBeUndefined();
  });

  it("keeps the cache when the same user is updated", () => {
    signedIn();
    seedCache();

    useAuthStore.getState().setUser({ id: "u1", displayName: "New" } as never);
    useAuthStore.setState({ isLoading: false });

    expect(cached()).toBe(3);
  });
});
