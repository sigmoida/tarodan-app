// @vitest-environment jsdom

/**
 * A 401 after the gateway ended the session must reach the auth store on
 * every page, so the session listener drops the user's cached queries. On a
 * public page the client does not redirect, so nothing else would.
 */

import type { AxiosAdapter } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  hasAuthMarker: vi.fn(() => false),
  getProfile: vi.fn(),
}));

// The store's own API layer; `./client` under test stays real.
vi.mock("@/lib/api", () => ({
  authApi: {},
  userApi: { getProfile: h.getProfile },
  USER_PROFILE_PATH: "/users/me",
}));

vi.mock("@/lib/authMarker", () => ({
  hasAuthMarker: h.hasAuthMarker,
  clearAuthMarker: vi.fn(),
}));
vi.mock("@/lib/server/auth-actions", () => ({
  loginAction: vi.fn(),
  googleLoginAction: vi.fn(),
  appleLoginAction: vi.fn(),
  logoutAction: vi.fn(),
}));
vi.mock("@/lib/query/getQueryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const client = new QueryClient();
  return { getQueryClient: () => client };
});

import { getQueryClient } from "@/lib/query/getQueryClient";
import { useAuthStore } from "@/stores/authStore";
import { api } from "./client";

const ORDERS = ["orders", "list"];

/** Answers like the gateway for a dead session. */
const unauthorized: AxiosAdapter = (config) =>
  Promise.reject({ config, response: { status: 401, data: {} } });

function signedInAsU1WithCache() {
  useAuthStore.setState({
    user: { id: "u1" } as never,
    isAuthenticated: true,
    isLoading: false,
  });
  getQueryClient().setQueryData(ORDERS, ["u1-order"]);
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
  getQueryClient().clear();
  h.hasAuthMarker.mockReset().mockReturnValue(false);
  h.getProfile.mockReset();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("api client 401 with the session gone", () => {
  it("signs the store out and empties the cache on a public page", async () => {
    window.history.replaceState(null, "", "/listings/abc");
    signedInAsU1WithCache();
    h.getProfile.mockRejectedValue({ response: { status: 401 } });

    await expect(
      api.get("/wishlist", { adapter: unauthorized }),
    ).rejects.toBeTruthy();
    await flush();

    expect(h.getProfile).toHaveBeenCalledTimes(1);

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getQueryClient().getQueryData(ORDERS)).toBeUndefined();
  });

  it("keeps the session when the server still knows the user (refresh race)", async () => {
    window.history.replaceState(null, "", "/listings/abc");
    signedInAsU1WithCache();
    h.getProfile.mockResolvedValue({ data: { id: "u1" } });

    await expect(
      api.get("/wishlist", { adapter: unauthorized }),
    ).rejects.toBeTruthy();
    await flush();

    expect(useAuthStore.getState().user?.id).toBe("u1");
    expect(getQueryClient().getQueryData(ORDERS)).toEqual(["u1-order"]);
  });

  it("keeps the session when the marker survived (transient refresh failure)", async () => {
    window.history.replaceState(null, "", "/listings/abc");
    h.hasAuthMarker.mockReturnValue(true);
    signedInAsU1WithCache();

    await expect(
      api.get("/wishlist", { adapter: unauthorized }),
    ).rejects.toBeTruthy();

    expect(useAuthStore.getState().user?.id).toBe("u1");
    expect(getQueryClient().getQueryData(ORDERS)).toEqual(["u1-order"]);
  });

  it("leaves the checkout session alone, as before", async () => {
    window.history.replaceState(null, "", "/checkout");
    signedInAsU1WithCache();

    await expect(
      api.get("/payments/status", { adapter: unauthorized }),
    ).rejects.toBeTruthy();

    expect(h.getProfile).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.id).toBe("u1");
  });

  it("re-checks when another request 401s while a check is answering", async () => {
    window.history.replaceState(null, "", "/listings/abc");
    signedInAsU1WithCache();
    let answer!: (v: unknown) => void;
    h.getProfile
      .mockReturnValueOnce(new Promise((r) => (answer = r)))
      .mockRejectedValueOnce({ response: { status: 401 } });
    const check = useAuthStore.getState().checkAuth();

    await expect(
      api.get("/wishlist", { adapter: unauthorized }),
    ).rejects.toBeTruthy();
    answer({ data: { id: "u1" } }); // answered just before the session ended
    await check;

    expect(h.getProfile).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getQueryClient().getQueryData(ORDERS)).toBeUndefined();
  });
});
