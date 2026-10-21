// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
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
  const client = new QueryClient({
    // The app's defaults (lib/query/client.ts): 60 s fresh, no focus refetch.
    defaultOptions: {
      queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false },
    },
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
