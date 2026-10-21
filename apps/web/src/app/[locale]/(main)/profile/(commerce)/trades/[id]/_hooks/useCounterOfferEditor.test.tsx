// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  focusManager,
  QueryClientProvider,
  type QueryClient,
} from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query/client";
import { invalidateListingQueries } from "@/lib/query/invalidateListing";
import type { Trade } from "../_lib/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const getMyProducts = vi.fn();
const getAll = vi.fn();
const counter = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/api", () => ({
  tradesApi: { counter: (...a: unknown[]) => counter(...a) },
  listingsApi: { getAll: (...a: unknown[]) => getAll(...a) },
  userApi: { getMyProducts: (...a: unknown[]) => getMyProducts(...a) },
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: "me" } }),
}));
vi.mock("@/hooks/useTradeCostPreview", () => ({
  useTradeCostPreview: () => ({
    preview: null,
    previewLoading: false,
    previewFailed: false,
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

import { useCounterOfferEditor } from "./useCounterOfferEditor";

const row = (id: string) => ({
  id,
  title: id,
  price: 10,
  status: "active",
  isTradeEnabled: true,
});
const rows = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => row(`${prefix}${from + i}`));

/** Serve `all` 20 per page in the API envelope. */
const serve =
  (all: ReturnType<typeof row>[]) =>
  async (params: { page: number; limit: number }) => ({
    data: {
      data: all.slice(
        (params.page - 1) * params.limit,
        params.page * params.limit,
      ),
      meta: { totalPages: Math.ceil(all.length / params.limit) },
    },
  });

const tradeItem = (productId: string, side: string) => ({
  id: `i-${productId}`,
  productId,
  productTitle: productId,
  side,
  quantity: 1,
  valueAtTrade: 100,
});

const trade = {
  id: "tr1",
  initiatorId: "other",
  receiverId: "me",
  initiatorItems: [tradeItem("want1", "initiator")],
  receiverItems: [tradeItem("mine1", "receiver")],
} as unknown as Trade;

const mounted = new Set<() => void>();
function renderHook<T>(
  hook: () => T,
  wrapper: (p: { children: ReactNode }) => ReactNode,
) {
  const result = { current: undefined as T };
  const Probe = () => {
    result.current = hook();
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<>{wrapper({ children: <Probe /> })}</>));
  mounted.add(() => act(() => root.unmount()));
  return result;
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

let client: QueryClient;
function setup() {
  client = makeQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useCounterOfferEditor({ trade, invalidateTrade: async () => {} }),
    wrapper,
  );
}

beforeEach(() => {
  getMyProducts.mockReset();
  getAll.mockReset();
  counter.mockReset();
  toastError.mockReset();
});
afterEach(() => {
  mounted.forEach((u) => u());
  mounted.clear();
});

describe("useCounterOfferEditor, paged pickers", () => {
  it("does not fetch until the editor opens", async () => {
    getMyProducts.mockImplementation(serve([]));
    getAll.mockImplementation(serve([]));
    setup();
    await act(async () => {});
    expect(getMyProducts).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
  });

  it("sends the server filters for both sides and pre-selects the trade items", async () => {
    getMyProducts.mockImplementation(serve(rows("m", 1, 3)));
    getAll.mockImplementation(serve(rows("t", 1, 3)));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() =>
      expect(result.current.isLoadingCounterData).toBe(false),
    );

    // My side: any own active trade-enabled listing (no tradeEligible).
    expect(getMyProducts).toHaveBeenCalledWith({
      status: "active",
      tradeOnly: true,
      page: 1,
      limit: 20,
    });
    // Their side: a stable order, so paging never skips a listing.
    expect(getAll).toHaveBeenCalledWith({
      sellerId: "other",
      status: "active",
      tradeOnly: true,
      sortBy: "created_desc",
      page: 1,
      limit: 20,
    });
    expect(result.current.selectedCounterProducts).toEqual(["mine1"]);
    expect(result.current.selectedCounterTargetProducts).toEqual(["want1"]);
    // Items already in the trade come first.
    expect(result.current.counterProducts.map((p) => p.id)).toEqual([
      "mine1",
      "m1",
      "m2",
      "m3",
    ]);
    expect(result.current.counterTargetProducts.map((p) => p.id)).toEqual([
      "want1",
      "t1",
      "t2",
      "t3",
    ]);
  });

  it("pages my side beyond 20 (20, 20, 5) with no duplicates and keeps picks across pages", async () => {
    getMyProducts.mockImplementation(serve(rows("m", 1, 45)));
    getAll.mockImplementation(serve([]));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() =>
      expect(result.current.counterProducts).toHaveLength(21),
    );
    expect(result.current.counterProductsHasMore).toBe(true);

    act(() => result.current.toggleCounterProduct("m3"));
    act(() => result.current.loadMoreCounterProducts());
    await waitFor(() =>
      expect(result.current.counterProducts).toHaveLength(41),
    );
    act(() => result.current.loadMoreCounterProducts());
    await waitFor(() =>
      expect(result.current.counterProducts).toHaveLength(46),
    );
    expect(result.current.counterProductsHasMore).toBe(false);

    const ids = result.current.counterProducts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    act(() => result.current.toggleCounterProduct("m44"));
    expect(result.current.selectedCounterProducts).toEqual([
      "mine1",
      "m3",
      "m44",
    ]);
  });

  it("pages their side beyond 20 independently of my side", async () => {
    getMyProducts.mockImplementation(serve([]));
    getAll.mockImplementation(serve(rows("t", 1, 25)));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() =>
      expect(result.current.counterTargetProducts).toHaveLength(21),
    );
    expect(result.current.counterTargetHasMore).toBe(true);
    expect(result.current.counterProductsHasMore).toBe(false);
    act(() => result.current.loadMoreCounterTarget());
    await waitFor(() =>
      expect(result.current.counterTargetProducts).toHaveLength(26),
    );
    expect(result.current.counterTargetHasMore).toBe(false);
  });

  it("does not list a trade item twice when the server also returns it", async () => {
    getMyProducts.mockImplementation(serve([row("mine1"), row("m1")]));
    getAll.mockImplementation(serve([]));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() => expect(result.current.counterProducts).toHaveLength(2));
    expect(result.current.counterProducts.map((p) => p.id)).toEqual([
      "mine1",
      "m1",
    ]);
  });

  it("closes the editor with an error toast when the first load fails", async () => {
    getMyProducts.mockRejectedValue(new Error("boom"));
    getAll.mockImplementation(serve([]));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() => expect(result.current.isCounterMode).toBe(false));
    expect(toastError).toHaveBeenCalledWith("collection.productsLoadFailed");
  });

  it("prunes a picked listing that is gone after a focus refetch, never sending it", async () => {
    getMyProducts.mockImplementation(serve(rows("m", 1, 3)));
    getAll.mockImplementation(serve(rows("t", 1, 2)));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() => expect(result.current.counterProducts).toHaveLength(4));
    act(() => result.current.toggleCounterProduct("m2"));
    act(() => result.current.toggleCounterTargetProduct("t2"));
    expect(result.current.selectedCounterProducts).toContain("m2");

    // m2 and t2 were sold meanwhile; the tab regains focus with the editor open.
    getMyProducts.mockImplementation(serve([row("m1"), row("m3")]));
    getAll.mockImplementation(serve([row("t1")]));
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(result.current.counterProducts).toHaveLength(3));
    await waitFor(() =>
      expect(result.current.selectedCounterProducts).toEqual(["mine1"]),
    );
    expect(result.current.selectedCounterTargetProducts).toEqual(["want1"]);

    counter.mockResolvedValue({});
    act(() => result.current.toggleCounterProduct("m3"));
    act(() => result.current.handleCounterSubmit());
    await waitFor(() => expect(counter).toHaveBeenCalledTimes(1));
    expect(counter.mock.calls[0][1].initiatorItems).toEqual([
      { productId: "mine1", quantity: 1 },
      { productId: "m3", quantity: 1 },
    ]);
    expect(counter.mock.calls[0][1].receiverItems).toEqual([
      { productId: "want1", quantity: 1 },
    ]);
  });

  it("keeps a pick that slid past the loaded pages on refetch, pinned and sent", async () => {
    getMyProducts.mockImplementation(serve(rows("m", 1, 25)));
    getAll.mockImplementation(serve([]));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() =>
      expect(result.current.counterProducts).toHaveLength(21),
    );
    act(() => result.current.toggleCounterProduct("m20"));

    // A new listing pushes m20 onto page 2 (not loaded); the tab regains focus.
    getMyProducts.mockImplementation(serve([row("new"), ...rows("m", 1, 25)]));
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() =>
      expect(result.current.counterProducts.map((p) => p.id)).toContain("new"),
    );
    expect(result.current.selectedCounterProducts).toEqual(["mine1", "m20"]);
    // Not on a loaded page any more, so pinned above the loaded rows.
    expect(result.current.counterProducts[0].id).toBe("m20");

    counter.mockResolvedValue({});
    act(() => result.current.handleCounterSubmit());
    await waitFor(() => expect(counter).toHaveBeenCalledTimes(1));
    expect(counter.mock.calls[0][1].initiatorItems).toEqual([
      { productId: "mine1", quantity: 1 },
      { productId: "m20", quantity: 1 },
    ]);
  });

  it("shows the spinner again on a reopen until this open's data arrives", async () => {
    getMyProducts.mockImplementation(serve(rows("m", 1, 2)));
    getAll.mockImplementation(serve([]));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() =>
      expect(result.current.isLoadingCounterData).toBe(false),
    );
    act(() => result.current.handleExitCounterMode());

    let release: () => void = () => {};
    getMyProducts.mockImplementation(
      (params: { page: number; limit: number }) =>
        new Promise((resolve) => {
          release = () => resolve(serve(rows("m", 1, 3))(params));
        }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    act(() => result.current.handleOpenCounterModal());
    expect(result.current.isLoadingCounterData).toBe(true);
    await waitFor(() => expect(getMyProducts).toHaveBeenCalledTimes(2));
    await act(async () => release());
    await waitFor(() =>
      expect(result.current.isLoadingCounterData).toBe(false),
    );
    expect(result.current.counterProducts).toHaveLength(4);
  });

  it("keeps the editor, lists and picks when Show more fails", async () => {
    getMyProducts.mockImplementation(serve(rows("m", 1, 25)));
    getAll.mockImplementation(serve([]));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() =>
      expect(result.current.counterProducts).toHaveLength(21),
    );
    act(() => result.current.toggleCounterProduct("m5"));

    getMyProducts.mockRejectedValue(new Error("boom"));
    act(() => result.current.loadMoreCounterProducts());
    await waitFor(() =>
      expect(result.current.counterProductsLoadingMore).toBe(false),
    );
    await act(async () => {});
    expect(result.current.isCounterMode).toBe(true);
    expect(result.current.counterProducts).toHaveLength(21);
    expect(result.current.selectedCounterProducts).toEqual(["mine1", "m5"]);
    expect(result.current.counterProductsHasMore).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps the editor open when a background refetch fails", async () => {
    getMyProducts.mockImplementation(serve(rows("m", 1, 3)));
    getAll.mockImplementation(serve(rows("t", 1, 3)));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() => expect(result.current.counterProducts).toHaveLength(4));

    getAll.mockRejectedValue(new Error("boom"));
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(getAll).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.isCounterMode).toBe(true);
    expect(result.current.counterTargetProducts).toHaveLength(4);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("refreshes my side on a listing write (shared trade-eligible invalidation)", async () => {
    getMyProducts.mockImplementation(serve(rows("m", 1, 2)));
    getAll.mockImplementation(serve([]));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() => expect(result.current.counterProducts).toHaveLength(3));

    getMyProducts.mockImplementation(serve(rows("m", 1, 3)));
    await act(async () => {
      await invalidateListingQueries(client);
    });
    await waitFor(() => expect(result.current.counterProducts).toHaveLength(4));
  });
});
