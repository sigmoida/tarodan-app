// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WishlistItem } from "./types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Favorites keeps its footer cart button (now the shared
 * `ProductCardCartButton`, full width with text) and its remove control; the
 * card's own price-row action is not added on top.
 */

const h = vi.hoisted(() => ({
  inCart: new Set<string>(),
  toggles: [] as string[],
}));

vi.mock("@/hooks/useCartToggle", () => ({
  useCartToggle: (productId: string) => ({
    inCart: h.inCart.has(productId),
    isPending: false,
    toggle: () => h.toggles.push(productId),
  }),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: { user: { id: string } }) => unknown) =>
    select({ user: { id: "me" } }),
}));
vi.mock("@/components/boost/useBoostOffers", () => ({
  useBoostEnabled: () => true,
}));
vi.mock("@/components/boost/useBoostLauncher", () => ({
  useBoostLauncher: () => ({ open: vi.fn(), dialog: null }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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

import FavoritesGrid from "./FavoritesGrid";

const item = (id: string): WishlistItem => ({
  id: `w-${id}`,
  productId: id,
  productTitle: `Model ${id}`,
  productPrice: 100,
  productStatus: "active",
  sellerId: "seller-1",
  sellerName: "Seller",
  addedAt: "2026-10-01T00:00:00Z",
});

let container: HTMLDivElement;
let root: Root;
const onRemove = vi.fn();

const render = (isSharedView = false) =>
  act(() =>
    root.render(
      <FavoritesGrid
        items={[item("a"), item("b")]}
        pendingCount={0}
        isSharedView={isSharedView}
        onRemove={onRemove}
        isPending={() => false}
      />,
    ),
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.inCart = new Set(["b"]);
  h.toggles = [];
  onRemove.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const cartButtons = () =>
  Array.from(container.querySelectorAll("button")).filter((b) =>
    /product\.(addToCart|removeFromCart)/.test(b.textContent ?? ""),
  );

describe("FavoritesGrid", () => {
  it("one full-width cart toggle per card, with its text, and no extra action", () => {
    render();
    const [add, remove] = cartButtons();

    expect(cartButtons()).toHaveLength(2);
    expect(add.textContent).toBe("product.addToCart");
    expect(add.className).toContain("w-full");
    expect(add.className).toContain("bg-primary-600");
    expect(remove.textContent).toBe("product.removeFromCart");
    expect(remove.className).toContain("bg-danger-600");
    // Only the remove control and the footer: no price-row action.
    expect(container.querySelectorAll("button")).toHaveLength(4);
  });

  it("the footer toggles that listing's cart line", () => {
    render();
    act(() => cartButtons()[1].click());
    expect(h.toggles).toEqual(["b"]);
  });

  it("the remove control removes the favorite; the shared view has none", () => {
    render();
    const removeFav = container.querySelector<HTMLButtonElement>(
      'button[aria-label="favorites.removeFromFavorites"]',
    )!;
    act(() => removeFav.click());
    expect(onRemove).toHaveBeenCalledWith("a");

    render(true);
    expect(
      container.querySelector(
        'button[aria-label="favorites.removeFromFavorites"]',
      ),
    ).toBeNull();
    expect(cartButtons()).toHaveLength(2);
  });
});
