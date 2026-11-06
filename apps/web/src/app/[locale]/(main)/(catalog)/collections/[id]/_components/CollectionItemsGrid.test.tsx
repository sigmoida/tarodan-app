// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionItem } from "../_lib/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ items: [] as unknown[], isOwner: false }));

vi.mock("../_context/CollectionDetailContext", () => ({
  useCollectionDetail: () => ({
    t: (key: string) => key,
    isOwner: h.isOwner,
    sortedItems: h.items,
    setShowAddModal: vi.fn(),
    handleRemoveItem: vi.fn(),
  }),
}));
// `@/components/ui` barrel'ı `server-only` zincirini çeker; gerçek kart yeter.
vi.mock("@/components/ui", async () => ({
  ProductCard: (await import("@/components/ui/ProductCard")).default,
}));
vi.mock("@/hooks/useWishlist", () => ({
  useProductFavorite: () => ({
    isFavorite: false,
    isPending: false,
    toggle: vi.fn(),
  }),
}));
vi.mock("@/hooks/useAuthGate", () => ({
  useAuthGate: () => ({ requireAuth: () => true, authModal: null }),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) =>
    selector({ user: { id: "me" } }),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "tr",
  useTranslations: () => (key: string) => key,
}));
// The card's price-row action reads the boost switch (a query); collection
// items carry no listing status, so the card shows no action here.
vi.mock("@/components/boost/useBoostOffers", () => ({
  useBoostEnabled: () => true,
}));
vi.mock("@/components/OptimizedImage", () => ({
  default: ({ alt }: { alt: string }) => <span data-img>{alt}</span>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import CollectionItemsGrid from "./CollectionItemsGrid";

const item = (over: Partial<CollectionItem>): CollectionItem => ({
  id: "i1",
  productId: "p1",
  productTitle: "Camaro",
  productPrice: 100,
  productStatus: "active",
  sortOrder: 0,
  isFeatured: false,
  addedAt: "2026-01-01",
  isCustom: false,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.isOwner = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const stacks = () =>
  container.querySelectorAll('[data-testid="product-card-badges"]');

describe("CollectionItemsGrid rozetleri", () => {
  it("durum rozeti olmayan öğede kartın kendi rozet yığını görünür", () => {
    h.items = [item({ isBoosted: true })];
    act(() => root.render(<CollectionItemsGrid />));
    expect(stacks()).toHaveLength(1);
    expect(container.textContent).toContain("product.boostedBadge");
    expect(container.textContent).not.toContain("product.sponsored");
  });

  it("satıldı öğede durum rozeti çizilir, kartın yığını çizilmez", () => {
    h.items = [item({ productStatus: "sold", isBoosted: true })];
    act(() => root.render(<CollectionItemsGrid />));
    expect(container.textContent).toContain("product.statusSold");
    expect(stacks()).toHaveLength(0);
  });

  it("özel öğede 'koleksiyon' rozeti çizilir", () => {
    h.items = [item({ isCustom: true, productId: undefined })];
    act(() => root.render(<CollectionItemsGrid />));
    expect(container.textContent).toContain("collection.collection");
    expect(stacks()).toHaveLength(0);
  });
});

describe("CollectionItemsGrid custom items (not for sale)", () => {
  const custom = item({
    id: "c1",
    isCustom: true,
    productId: undefined,
    productPrice: undefined,
    productStatus: undefined,
    productTitle: "My Camaro",
    customTitle: "My Camaro",
  });
  const cards = () =>
    Array.from(container.querySelectorAll<HTMLElement>(".\\@container"));

  it("shows the not-for-sale label and the collection badge, never a price", () => {
    h.items = [custom];
    act(() => root.render(<CollectionItemsGrid />));
    const text = container.textContent ?? "";
    expect(text).toContain("collection.notForSale");
    expect(text).toContain("collection.collection");
    expect(text).not.toContain("TL");
    expect(text).not.toMatch(/0,00/);
  });

  it("is not tappable: no link, no heart, no card action", () => {
    h.items = [custom];
    act(() => root.render(<CollectionItemsGrid />));
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("a listing item next to it keeps its price, link and heart", () => {
    h.items = [item({}), custom];
    act(() => root.render(<CollectionItemsGrid />));
    const [listing, own] = cards();
    expect(listing.textContent).toContain("100");
    expect(listing.textContent).toContain("TL");
    expect(listing.textContent).not.toContain("collection.notForSale");
    expect(listing.querySelector("a")).not.toBeNull();
    expect(
      listing.querySelector('button[aria-label="product.favorite"]'),
    ).not.toBeNull();
    expect(own.textContent).toContain("collection.notForSale");
    expect(own.textContent).not.toContain("TL");
  });

  it("the owner keeps the remove control on a custom item", () => {
    h.isOwner = true;
    h.items = [custom];
    act(() => root.render(<CollectionItemsGrid />));
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("collection.removeItem");
  });
});
