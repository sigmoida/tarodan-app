// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query/client";
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

function setup() {
  const client = makeQueryClient();
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
    expect(getAll).toHaveBeenCalledWith({
      sellerId: "other",
      status: "active",
      tradeOnly: true,
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

  it("prunes a picked listing that is gone after a refetch, never sending it", async () => {
    getMyProducts.mockImplementation(serve(rows("m", 1, 3)));
    getAll.mockImplementation(serve([]));
    const result = setup();
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() => expect(result.current.counterProducts).toHaveLength(4));
    act(() => result.current.toggleCounterProduct("m2"));
    expect(result.current.selectedCounterProducts).toContain("m2");

    // Reopen: m2 was sold meanwhile.
    getMyProducts.mockImplementation(serve([row("m1"), row("m3")]));
    act(() => result.current.handleExitCounterMode());
    act(() => result.current.handleOpenCounterModal());
    await waitFor(() => expect(result.current.counterProducts).toHaveLength(3));
    expect(result.current.selectedCounterProducts).not.toContain("m2");
  });
});
