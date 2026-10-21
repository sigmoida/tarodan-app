// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const getMyProducts = vi.fn();
let mockUserId: string | undefined = "u1";

vi.mock("@/lib/api", () => ({
  api: {},
  listingsApi: {},
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

import { useTradeableProducts } from "./useNewTrade";

const item = (id: string) => ({
  id,
  title: id,
  status: "active",
  isTradeEnabled: true,
});

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
  return {
    result,
    rerender: render,
    unmount: () => act(() => root.unmount()),
  };
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
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

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
});
