// @vitest-environment jsdom

/**
 * Cross-tab session changes seen from the header's reconcile: another tab
 * signing out or switching account must reach this tab's auth store, so the
 * session listener drops the previous user's cached queries.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  getProfile: vi.fn(),
  hasAuthMarker: vi.fn(() => true),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/hooks/useCart", () => ({
  useCart: () => ({ itemCount: 0, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useHeaderBadgeCounts", () => ({
  useHeaderBadgeCounts: () => ({}),
}));
vi.mock("@/lib/api", () => ({
  authApi: {},
  wishlistApi: { get: vi.fn(() => new Promise(() => undefined)) },
  userApi: { getProfile: h.getProfile },
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
import { useHeaderData } from "./useHeaderData";

const ORDERS = ["orders", "list"];
const SNAPSHOT_KEY = "tarodan_user_snapshot";

function Header() {
  useHeaderData();
  return null;
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const profileOf = (id: string) => ({ data: { id } });

let container: HTMLDivElement;
let root: Root;

/** Mounts the header for u1 with its orders cached, like a live tab. */
async function mountSignedInAsU1() {
  h.hasAuthMarker.mockReturnValue(true);
  h.getProfile.mockResolvedValue(profileOf("u1"));
  act(() =>
    root.render(
      <QueryClientProvider client={getQueryClient()}>
        <Header />
      </QueryClientProvider>,
    ),
  );
  await flush();
  expect(useAuthStore.getState().user?.id).toBe("u1");
  getQueryClient().setQueryData(ORDERS, ["u1-order"]);
  h.getProfile.mockClear();
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
  getQueryClient().clear();
  localStorage.clear();
  h.getProfile.mockReset();
  h.hasAuthMarker.mockReset().mockReturnValue(true);
});

describe("useHeaderData session reconcile", () => {
  it("drops u1's cache on focus after another tab signed out", async () => {
    await mountSignedInAsU1();

    h.hasAuthMarker.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("focus")));
    await flush();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getQueryClient().getQueryData(ORDERS)).toBeUndefined();
  });

  it("drops u1's cache at once when another tab removes the snapshot", async () => {
    await mountSignedInAsU1();

    h.hasAuthMarker.mockReturnValue(false);
    localStorage.removeItem(SNAPSHOT_KEY);
    act(
      () =>
        void window.dispatchEvent(
          new StorageEvent("storage", { key: SNAPSHOT_KEY }),
        ),
    );
    await flush();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getQueryClient().getQueryData(ORDERS)).toBeUndefined();
  });

  it("switches to u2 and drops u1's cache when another tab signed in as u2", async () => {
    await mountSignedInAsU1();

    h.getProfile.mockResolvedValue(profileOf("u2"));
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ id: "u2" }));
    act(
      () =>
        void window.dispatchEvent(
          new StorageEvent("storage", { key: SNAPSHOT_KEY }),
        ),
    );
    await flush();

    expect(useAuthStore.getState().user?.id).toBe("u2");
    expect(getQueryClient().getQueryData(ORDERS)).toBeUndefined();
  });

  it("does not re-check or touch the cache while the session agrees", async () => {
    await mountSignedInAsU1();

    act(() => void window.dispatchEvent(new Event("focus")));
    act(
      () =>
        void window.dispatchEvent(new StorageEvent("storage", { key: "cart" })),
    );
    await flush();

    expect(h.getProfile).not.toHaveBeenCalled();
    expect(getQueryClient().getQueryData(ORDERS)).toEqual(["u1-order"]);
  });
});
