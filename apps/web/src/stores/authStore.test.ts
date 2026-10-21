// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loginAction: vi.fn(),
  logoutAction: vi.fn(),
  getProfile: vi.fn(),
  hasAuthMarker: vi.fn(() => false),
}));

vi.mock("@/lib/api", () => ({
  authApi: {},
  userApi: { getProfile: h.getProfile },
}));
vi.mock("@/lib/authMarker", () => ({
  hasAuthMarker: h.hasAuthMarker,
  clearAuthMarker: vi.fn(),
}));
vi.mock("@/lib/server/auth-actions", () => ({
  loginAction: h.loginAction,
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
  h.loginAction.mockReset();
  h.logoutAction.mockReset();
  h.getProfile.mockReset();
  h.hasAuthMarker.mockReset().mockReturnValue(false);
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
  getQueryClient().clear();
  localStorage.clear();
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

  it("drops the guest cache on a sign-in in this tab", async () => {
    seedCache();
    h.loginAction.mockResolvedValue({ status: "ok", user: null });
    h.hasAuthMarker.mockReturnValue(true);
    h.getProfile.mockResolvedValue({ data: { id: "u1" } });

    await useAuthStore.getState().login("a@b.c", "secret");

    expect(useAuthStore.getState().user?.id).toBe("u1");
    expect(cached()).toBeUndefined();
  });

  it("drops the guest cache when checkAuth sees a sign-in from another tab", async () => {
    seedCache();
    h.hasAuthMarker.mockReturnValue(true);
    h.getProfile.mockResolvedValue({ data: { id: "u1" } });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().user?.id).toBe("u1");
    expect(cached()).toBeUndefined();
  });

  it("keeps the server-seeded cache when the session is restored on load", async () => {
    // A fresh page load with the session marker: the store starts unresolved.
    vi.resetModules();
    h.hasAuthMarker.mockReturnValue(true);
    h.getProfile.mockResolvedValue({ data: { id: "u1" } });
    const { getQueryClient: loadClient } =
      await import("@/lib/query/getQueryClient");
    const { useAuthStore: loadStore } = await import("./authStore");
    loadClient().setQueryData(key, 3);

    await loadStore.getState().checkAuth();

    expect(loadStore.getState().user?.id).toBe("u1");
    expect(loadClient().getQueryData(key)).toBe(3);
  });

  it("clears the cache when the profile replaces a stale snapshot", async () => {
    localStorage.setItem("tarodan_user_snapshot", JSON.stringify({ id: "u1" }));
    useAuthStore.setState({ isLoading: true });
    h.hasAuthMarker.mockReturnValue(true);
    h.getProfile.mockImplementation(async () => {
      seedCache(); // fetched while the u1 snapshot was shown
      return { data: { id: "u2" } };
    });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().user?.id).toBe("u2");
    expect(cached()).toBeUndefined();
  });

  it("clears the cache when checkAuth finds the session gone", async () => {
    signedIn();
    seedCache();
    h.hasAuthMarker.mockReturnValueOnce(true).mockReturnValue(false);
    h.getProfile.mockRejectedValue({ response: { status: 401 } });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(cached()).toBeUndefined();
  });

  it("keeps the cache when the same user is updated", () => {
    signedIn();
    seedCache();

    useAuthStore.getState().setUser({ id: "u1", displayName: "New" } as never);

    expect(cached()).toBe(3);
  });

  it("lets the latest checkAuth win when profile answers cross", async () => {
    signedIn();
    h.hasAuthMarker.mockReturnValue(true);
    let answerFirst!: (v: unknown) => void;
    h.getProfile
      .mockReturnValueOnce(new Promise((r) => (answerFirst = r)))
      .mockResolvedValueOnce({ data: { id: "u2" } });

    const first = useAuthStore.getState().checkAuth();
    await useAuthStore.getState().checkAuth();
    answerFirst({ data: { id: "u1" } });
    await first;

    expect(useAuthStore.getState().user?.id).toBe("u2");
  });
});
