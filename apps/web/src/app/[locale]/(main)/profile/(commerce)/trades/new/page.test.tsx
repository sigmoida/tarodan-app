// @vitest-environment jsdom
/** @format */

import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TradeProduct } from "./_lib/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The page owns the offer: which picks reach the cost preview and the create
 * request. The picker refetches on open and on tab focus, so a pick can leave
 * the list while the page is open (deactivated, sold, offered elsewhere); it
 * must never be sent or priced, and must not come back checked.
 */
const h = vi.hoisted(() => ({
  products: [] as TradeProduct[],
  productsLoading: false,
  mutate: vi.fn(),
  previewIds: [] as string[][],
  summaryIds: [] as string[][],
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (k: string) => (k === "listing" ? "t1" : null),
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({
    user: { id: "u1" },
    isAuthenticated: true,
    isLoading: false,
    limits: { canTrade: true },
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
// The `@/components/ui` barrel pulls the `server-only` chain.
vi.mock("@/components/ui", () => ({
  EmptyStateCard: ({ title }: { title: string }) => <div>{title}</div>,
  ButtonLink: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/ui/SectionCard", () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({ children }: { children?: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/components/layout/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/OptimizedImage", () => ({ default: () => null }));
vi.mock("@/components/trade/TradeCostPreview", () => ({ default: () => null }));
vi.mock("../_components/TradeAddressPicker", () => ({
  default: function TradeAddressPicker({
    onChange,
  }: {
    onChange: (id: string) => void;
  }) {
    useEffect(() => onChange("addr1"), [onChange]);
    return null;
  },
}));
vi.mock("./_components/TradeSummary", () => ({
  default: ({ selectedProducts }: { selectedProducts: TradeProduct[] }) => {
    h.summaryIds.push(selectedProducts.map((p) => p.id));
    return null;
  },
}));
vi.mock("@/hooks/useTradeCostPreview", () => ({
  useTradeCostPreview: ({ myProductIds }: { myProductIds: string[] }) => {
    h.previewIds.push(myProductIds);
    return { preview: null, previewLoading: false, previewFailed: false };
  },
}));
vi.mock("./_hooks/useNewTrade", () => ({
  useTradeTarget: () => ({
    target: { id: "t1", title: "Target", price: 100, sellerId: "s1" },
    isLoading: false,
  }),
  useTradeableProducts: () => ({
    products: h.products,
    isLoading: h.productsLoading,
  }),
  useCreateTrade: () => ({ mutate: h.mutate, isPending: false }),
}));

import NewTradePage from "./page";

const item = (id: string): TradeProduct => ({
  id,
  title: `Listing ${id}`,
  price: 50,
  status: "active",
  isTradeEnabled: true,
});

let container: HTMLDivElement;
let root: Root;

const render = () => act(() => root.render(<NewTradePage />));

const checkbox = (id: string) => {
  const label = [...container.querySelectorAll("label")].find((l) =>
    l.textContent?.includes(`Listing ${id}`),
  );
  const input = label?.querySelector("input");
  if (!input) throw new Error(`no checkbox for ${id}`);
  return input;
};

const sendButton = () => {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("trade.sendTrade"),
  );
  if (!button) throw new Error("no send button");
  return button;
};

const lastPreviewIds = () => h.previewIds[h.previewIds.length - 1];
const lastSummaryIds = () => h.summaryIds[h.summaryIds.length - 1];

beforeEach(() => {
  h.products = [];
  h.productsLoading = false;
  h.mutate.mockReset();
  h.previewIds = [];
  h.summaryIds = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("new trade page, picks that leave the refreshed picker", () => {
  it("never sends or prices a vanished pick, and it does not return checked", () => {
    h.products = [item("a"), item("b")];
    render();
    act(() => checkbox("a").click());
    act(() => checkbox("b").click());
    expect(lastPreviewIds()).toEqual(["a", "b"]);

    // A refetch (tab focus, invalidation) drops "a".
    h.products = [item("b")];
    render();
    expect(lastPreviewIds()).toEqual(["b"]);
    expect(lastSummaryIds()).toEqual(["b"]);

    act(() => sendButton().click());
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0][0]).toMatchObject({
      receiverId: "s1",
      initiatorItems: [{ productId: "b", quantity: 1 }],
      receiverItems: [{ productId: "t1", quantity: 1 }],
      shippingAddressId: "addr1",
    });

    // "a" is eligible again later: pruned, so it comes back unchecked.
    h.products = [item("a"), item("b")];
    render();
    expect(checkbox("a").checked).toBe(false);
    expect(checkbox("b").checked).toBe(true);
    expect(lastPreviewIds()).toEqual(["b"]);
  });

  it("disables send and submits nothing when the only pick vanishes", () => {
    h.products = [item("a")];
    render();
    act(() => checkbox("a").click());
    expect(sendButton().disabled).toBe(false);

    h.products = [];
    render();
    expect(sendButton().disabled).toBe(true);
    expect(lastPreviewIds()).toEqual([]);
    act(() => sendButton().click());
    expect(h.mutate).not.toHaveBeenCalled();
  });
});

describe("new trade page, picker loading versus empty", () => {
  const EMPTY = "page.new.tradeproductpicker.takasEdilebilirAktifIlaninizYok";

  it("shows a spinner, not the empty state, while the picker is loading", () => {
    h.productsLoading = true;
    render();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(container.textContent).not.toContain(EMPTY);
  });

  it("shows the empty state once the fetch settles empty", () => {
    render();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.textContent).toContain(EMPTY);
  });

  it("keeps the list on screen while a non-empty list refetches", () => {
    h.products = [item("a")];
    h.productsLoading = true;
    render();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(checkbox("a")).toBeDefined();
  });
});
