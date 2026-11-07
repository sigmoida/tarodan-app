// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The cart summary is priced from the selected, payable lines whatever their
 * source. A guest cart has `items: []` (its lines live in the offline store),
 * so deriving the quote input from `items` left every summary line as "—".
 */
const h = vi.hoisted(() => ({
  getQuote: vi.fn(),
  cart: {} as Record<string, unknown>,
}));

vi.mock("@/lib/api", () => ({ ordersApi: { getQuote: h.getQuote } }));
vi.mock("@/hooks/useCart", () => ({ useCart: () => h.cart }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@tarodan/ui", () => ({ Checkbox: () => null }));
vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({ children }: { children: unknown }) => <>{children}</>,
}));
vi.mock("@/components/layout/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("./_components/CartItemCard", () => ({ default: () => null }));
vi.mock("./_components/CartSummary", () => ({ default: () => null }));
vi.mock("./_components/CartSkeleton", () => ({ default: () => null }));
vi.mock("./_components/EmptyCart", () => ({ default: () => null }));
vi.mock("./_components/CartSimilarProducts", () => ({ default: () => null }));

import CartClient from "./CartClient";
import { useCartStore } from "@/stores/cartStore";

const line = (
  source: "authenticated" | "offline",
  productId: string,
  quantity: number,
  isAvailable = true,
) => ({
  id: `${source}-${productId}`,
  source,
  productId,
  title: productId,
  imageUrl: null,
  sellerId: "s1",
  sellerName: "Seller",
  quantity,
  price: 100,
  lineTotal: 100 * quantity,
  isAvailable,
});
const offlineLine = (productId: string, quantity: number, isAvailable = true) =>
  line("offline", productId, quantity, isAvailable);
const serverLine = (productId: string, quantity: number, isAvailable = true) =>
  line("authenticated", productId, quantity, isAvailable);

/** Fill the mocked `useCart` result; every test starts from a fresh object. */
function setCart(
  overrides: { lines: ReturnType<typeof line>[] } & Record<string, unknown>,
) {
  h.cart = {
    isAuthenticated: false,
    lineCount: overrides.lines.length,
    items: [],
    isLoading: false,
    refetch: vi.fn().mockResolvedValue(undefined),
    appliedDiscounts: [],
    appliedCouponCode: null,
    canCheckout: true,
    ...overrides,
  };
}

async function quoteInput() {
  await act(async () => {
    await vi.waitFor(() => expect(h.getQuote).toHaveBeenCalled());
  });
  return h.getQuote.mock.calls.at(-1)?.[0];
}

let container: HTMLDivElement;
let root: Root;

async function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <CartClient />
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  h.getQuote.mockReset();
  useCartStore.setState({ excludedProductIds: [] });
  h.getQuote.mockResolvedValue({ data: { pricing: { summary: {} } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
});

describe("CartClient quote input", () => {
  it("prices a guest cart (offline lines, no server items)", async () => {
    setCart({
      isAuthenticated: false,
      lines: [
        offlineLine("p1", 2),
        offlineLine("p2", 1),
        offlineLine("p3", 1, false),
      ],
      appliedCouponCode: "GUEST10",
    });

    await render();

    expect(await quoteInput()).toEqual({
      items: [
        { productId: "p1", quantity: 2 },
        { productId: "p2", quantity: 1 },
      ],
      couponCode: "GUEST10",
    });
  });

  it("prices only the selected, available server lines when logged in", async () => {
    // `items` is what the summary used to be priced from; it must no longer
    // matter, the normalized `lines` + selection decide.
    setCart({
      isAuthenticated: true,
      lines: [
        serverLine("p1", 3),
        serverLine("p2", 1),
        serverLine("p3", 2, false),
      ],
      appliedCouponCode: "SERVER5",
    });
    useCartStore.setState({ excludedProductIds: ["p2"] });

    await render();

    expect(await quoteInput()).toEqual({
      items: [{ productId: "p1", quantity: 3 }],
      couponCode: "SERVER5",
    });
  });

  it("leaves a deselected guest line out of the quote", async () => {
    setCart({
      isAuthenticated: false,
      lines: [offlineLine("p1", 1), offlineLine("p2", 4)],
    });
    useCartStore.setState({ excludedProductIds: ["p1"] });

    await render();

    expect(await quoteInput()).toEqual({
      items: [{ productId: "p2", quantity: 4 }],
    });
  });
});
