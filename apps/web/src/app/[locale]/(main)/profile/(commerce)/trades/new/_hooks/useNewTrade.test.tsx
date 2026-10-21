// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const getMyProducts = vi.fn();
const getOne = vi.fn();
let mockUserId: string | undefined = "u1";

vi.mock("@/lib/api", () => ({
  api: {},
  listingsApi: { getOne: (...a: unknown[]) => getOne(...a) },
  userApi: { getMyProducts: (...a: unknown[]) => getMyProducts(...a) },
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: mockUserId ? { id: mockUserId } : null }),
}));
vi.mock("@/lib/logger", () => ({ logger: { captureException: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { useTradeTarget, useTradeableProducts } from "./useNewTrade";

const item = (id: string) => ({
  id,
  title: id,
  status: "active",
  isTradeEnabled: true,
});

/** Roots still mounted; unmounted after each test so no observer leaks. */
const mounted = new Set<() => void>();

/** Minimal renderHook (no testing-library in this package). */
function renderHook<T>(
  hook: () => T,
  { wrapper }: { wrapper: (p: { children: ReactNode }) => ReactNode },
) {
  const result = { current: undefined as T };
  const Probe = () => {
    result.current = hook();
    return null;
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () =>
    act(() => {
      root.render(<>{wrapper({ children: <Probe /> })}</>);
    });
  render();
  const unmount = () => {
    if (!mounted.delete(unmount)) return;
    act(() => root.unmount());
  };
  mounted.add(unmount);
  return { result, rerender: render, unmount };
}

async function waitFor(assertion: () => void) {
  let last: unknown;
  for (let i = 0; i < 50; i++) {
    try {
      assertion();
      return;
    } catch (e) {
      last = e;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
  }
  throw last;
}

function setup() {
  // The app's real client (60 s fresh, no focus refetch, ...), so the picker's
  // own options are proven against the defaults they override. Only the retry
  // is off: a failure settles without the app's 1.5 s retry delay.
  const client = makeQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => {
  mounted.forEach((unmount) => unmount());
  // Back to the default document-visibility focus check.
  focusManager.setFocused(undefined);
});

describe("useTradeableProducts", () => {
  beforeEach(() => {
    getMyProducts.mockReset();
    mockUserId = "u1";
  });

  it("refetches on mount even when the cache is fresh", async () => {
    const { wrapper } = setup();
    getMyProducts.mockResolvedValue({ data: { data: [item("a")] } });
    const first = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.products).toHaveLength(1));
    first.unmount();

    getMyProducts.mockResolvedValue({
      data: { data: [item("a"), item("b")] },
    });
    const second = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(second.result.current.products).toHaveLength(2));
    expect(getMyProducts).toHaveBeenCalledTimes(2);
  });

  it("reports loading, not empty, while a cached empty list refetches on reopen", async () => {
    const { wrapper } = setup();
    getMyProducts.mockResolvedValue({ data: { data: [] } });
    const first = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(getMyProducts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    getMyProducts.mockReturnValue(new Promise(() => {}));
    const second = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(getMyProducts).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    // The cached [] must not read as "no listings" while the reopen refetch runs.
    expect(second.result.current.products).toEqual([]);
    expect(second.result.current.isLoading).toBe(true);
  });

  it("shows a listing approved since a cached empty visit on reopen (the reported bug)", async () => {
    const { wrapper } = setup();
    getMyProducts.mockResolvedValue({ data: { data: [] } });
    const first = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.products).toEqual([]);
    first.unmount();

    // Approved by a moderator: no client mutation, the cached [] is still fresh.
    let resolveRefetch: (v: unknown) => void = () => {};
    getMyProducts.mockReturnValue(
      new Promise((r) => {
        resolveRefetch = r;
      }),
    );
    const second = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(getMyProducts).toHaveBeenCalledTimes(2));
    expect(second.result.current.isLoading).toBe(true);

    await act(async () => {
      resolveRefetch({ data: { data: [item("approved")] } });
    });
    await waitFor(() =>
      expect(second.result.current.products.map((p) => p.id)).toEqual([
        "approved",
      ]),
    );
    expect(second.result.current.isLoading).toBe(false);
  });

  it("settles when the reopen refetch over a cached empty list fails", async () => {
    const { wrapper } = setup();
    getMyProducts.mockResolvedValue({ data: { data: [] } });
    const first = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    getMyProducts.mockRejectedValue(new Error("boom"));
    const second = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(getMyProducts).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
  });

  it("stays idle until the user id is known", async () => {
    const { wrapper } = setup();
    mockUserId = undefined;
    getMyProducts.mockResolvedValue({ data: { data: [item("a")] } });
    renderHook(() => useTradeableProducts("t1", true), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(getMyProducts).not.toHaveBeenCalled();
  });

  it("reports loading, not empty, while the first fetch is in flight", async () => {
    const { wrapper } = setup();
    getMyProducts.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(getMyProducts).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.products).toEqual([]);
  });

  it("excludes the target listing", async () => {
    const { wrapper } = setup();
    getMyProducts.mockResolvedValue({
      data: { data: [item("t1"), item("b")] },
    });
    const { result } = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.products).toHaveLength(1));
    expect(result.current.products[0].id).toBe("b");
  });

  describe("paging", () => {
    const ids = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => item(`p${from + i}`));
    /** 45 eligible rows, served 20 per page by the server. */
    const serve = (all = ids(1, 45)) =>
      getMyProducts.mockImplementation(
        async (params: { page: number; limit: number }) => ({
          data: {
            data: all.slice(
              (params.page - 1) * params.limit,
              params.page * params.limit,
            ),
            meta: {
              total: all.length,
              page: params.page,
              limit: params.limit,
              totalPages: Math.ceil(all.length / params.limit),
            },
          },
        }),
      );

    it("sends the server filters and the page size, with no client eligibility filter", async () => {
      const { wrapper } = setup();
      // The server decides eligibility: rows are shown as returned.
      getMyProducts.mockResolvedValue({
        data: {
          data: [{ ...item("a"), isTradeEnabled: false, status: "reserved" }],
          meta: { totalPages: 1 },
        },
      });
      const { result } = renderHook(() => useTradeableProducts("t1", true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.products).toHaveLength(1));
      expect(getMyProducts).toHaveBeenCalledWith({
        status: "active",
        tradeEligible: true,
        tradeOnly: true,
        page: 1,
        limit: 20,
      });
      expect(result.current.hasMore).toBe(false);
    });

    it("loads 20, then 20, then 5, and stops offering more", async () => {
      const { wrapper } = setup();
      serve();
      const { result } = renderHook(() => useTradeableProducts("t1", true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.products).toHaveLength(20));
      expect(result.current.hasMore).toBe(true);

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.products).toHaveLength(40));
      expect(result.current.hasMore).toBe(true);

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.products).toHaveLength(45));
      expect(result.current.hasMore).toBe(false);
      expect(getMyProducts.mock.calls.map((c) => c[0].page)).toEqual([1, 2, 3]);
      const all = result.current.products.map((p) => p.id);
      expect(new Set(all).size).toBe(45);
    });

    it("keeps the target excluded on every page", async () => {
      const { wrapper } = setup();
      serve([...ids(1, 19), item("t1"), ...ids(21, 30)]);
      const { result } = renderHook(() => useTradeableProducts("t1", true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.products).toHaveLength(19));
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.products).toHaveLength(29));
      expect(result.current.products.some((p) => p.id === "t1")).toBe(false);
    });

    it("drops a duplicate row when a refetch shifts one across a page boundary", async () => {
      const { wrapper } = setup();
      const all = ids(1, 30);
      serve(all);
      const { result } = renderHook(() => useTradeableProducts("t1", true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.products).toHaveLength(20));
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.products).toHaveLength(30));

      // Page 1 now also holds p21 (a new listing pushed rows down).
      getMyProducts.mockImplementation(async (params: { page: number }) => ({
        data: {
          data: params.page === 1 ? [item("p21"), ...ids(1, 19)] : ids(21, 30),
          meta: { totalPages: 2 },
        },
      }));
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => expect(result.current.products).toHaveLength(30));
      const seen = result.current.products.map((p) => p.id);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it("refetches every loaded page on reopen", async () => {
      const { wrapper } = setup();
      serve();
      const first = renderHook(() => useTradeableProducts("t1", true), {
        wrapper,
      });
      await waitFor(() =>
        expect(first.result.current.products).toHaveLength(20),
      );
      act(() => first.result.current.loadMore());
      await waitFor(() =>
        expect(first.result.current.products).toHaveLength(40),
      );
      first.unmount();
      getMyProducts.mockClear();

      const second = renderHook(() => useTradeableProducts("t1", true), {
        wrapper,
      });
      await waitFor(() =>
        expect(getMyProducts.mock.calls.map((c) => c[0].page)).toEqual([1, 2]),
      );
      await waitFor(() =>
        expect(second.result.current.products).toHaveLength(40),
      );
    });

    it("keeps the list on screen and stops the more-spinner when loading more fails", async () => {
      const { wrapper } = setup();
      serve();
      const { result } = renderHook(() => useTradeableProducts("t1", true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.products).toHaveLength(20));
      getMyProducts.mockRejectedValue(new Error("boom"));
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
      expect(result.current.products).toHaveLength(20);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("keys the cache by user so a switch never shows another user's list", async () => {
    const { client, wrapper } = setup();
    getMyProducts.mockResolvedValue({ data: { data: [item("a")] } });
    const { result, rerender } = renderHook(
      () => useTradeableProducts("t1", true),
      { wrapper },
    );
    await waitFor(() => expect(result.current.products).toHaveLength(1));

    mockUserId = "u2";
    getMyProducts.mockReturnValue(new Promise(() => {}));
    rerender();
    expect(result.current.products).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: queryKeys.tradeEligible.all() }),
    ).toHaveLength(2);
  });
  it("settles to the empty state when the fetch fails (no endless spinner)", async () => {
    const { wrapper } = setup();
    getMyProducts.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(getMyProducts).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.products).toEqual([]);
  });

  it("refetches when the tab regains focus, without a spinner over a settled empty list", async () => {
    const { wrapper } = setup();
    getMyProducts.mockResolvedValue({ data: { data: [] } });
    const { result } = renderHook(() => useTradeableProducts("t1", true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getMyProducts).toHaveBeenCalledTimes(1);

    let resolveRefetch: (v: unknown) => void = () => {};
    getMyProducts.mockReturnValue(
      new Promise((r) => {
        resolveRefetch = r;
      }),
    );
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(getMyProducts).toHaveBeenCalledTimes(2));
    // Let react-query's batched notify render the in-flight refetch.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    // The settled empty state stays while the background refetch runs.
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      resolveRefetch({ data: { data: [item("new")] } });
    });
    await waitFor(() => expect(result.current.products).toHaveLength(1));
  });
});

describe("useTradeTarget", () => {
  beforeEach(() => {
    getOne.mockReset();
  });

  it("refetches the target on mount even when the cache is fresh", async () => {
    const { wrapper } = setup();
    getOne.mockResolvedValue({ data: { product: { id: "t1", price: 10 } } });
    const first = renderHook(() => useTradeTarget("t1", true), { wrapper });
    await waitFor(() => expect(first.result.current.target?.price).toBe(10));
    first.unmount();

    getOne.mockResolvedValue({ data: { product: { id: "t1", price: 12 } } });
    const second = renderHook(() => useTradeTarget("t1", true), { wrapper });
    await waitFor(() => expect(second.result.current.target?.price).toBe(12));
    expect(getOne).toHaveBeenCalledTimes(2);
  });
});
