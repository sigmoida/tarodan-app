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

const offlineLine = (
  productId: string,
  quantity: number,
  isAvailable = true,
) => ({
  id: `offline-${productId}`,
  source: "offline" as const,
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
  h.getQuote.mockResolvedValue({ data: { pricing: { summary: {} } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
});

describe("CartClient quote input", () => {
  it("prices a guest cart (offline lines, no server items)", async () => {
    const lines = [
      offlineLine("p1", 2),
      offlineLine("p2", 1),
      offlineLine("p3", 1, false),
    ];
    Object.assign(h.cart, {
      isAuthenticated: false,
      lines,
      lineCount: lines.length,
      items: [],
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
      appliedDiscounts: [],
      appliedCouponCode: "GUEST10",
      canCheckout: true,
    });

    await render();
    await act(async () => {
      await vi.waitFor(() => expect(h.getQuote).toHaveBeenCalled());
    });

    expect(h.getQuote).toHaveBeenCalledWith({
      items: [
        { productId: "p1", quantity: 2 },
        { productId: "p2", quantity: 1 },
      ],
      couponCode: "GUEST10",
    });
  });
});
