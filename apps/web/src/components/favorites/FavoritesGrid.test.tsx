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
  pending: new Set<string>(),
  toggles: [] as string[],
  userId: "me" as string | null,
}));

vi.mock("@/hooks/useCartToggle", () => ({
  useCartToggle: (productId: string) => ({
    inCart: h.inCart.has(productId),
    isPending: h.pending.has(productId),
    toggle: () => h.toggles.push(productId),
  }),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: { user: { id: string } | null }) => unknown) =>
    select({ user: h.userId ? { id: h.userId } : null }),
}));
vi.mock("@/components/boost/useBoostOffers", () => ({
  useBoostEnabled: () => true,
}));
vi.mock("@/components/boost/useBoostLauncher", () => ({
  useBoostLauncher: () => ({ open: vi.fn(), dialog: null }),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "tr",
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
  h.pending = new Set();
  h.toggles = [];
  h.userId = "me";
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

  it("the footer looks busy while its write runs, without native disabled", () => {
    h.pending = new Set(["a"]);
    render();
    const [busy, idle] = cartButtons();

    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.disabled).toBe(false);
    expect(idle.hasAttribute("aria-busy")).toBe(false);
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

  describe("footer follows the card rule", () => {
    const renderOne = (over: Partial<WishlistItem>) =>
      act(() =>
        root.render(
          <FavoritesGrid
            items={[{ ...item("x"), ...over }]}
            pendingCount={0}
            isSharedView={false}
            onRemove={onRemove}
            isPending={() => false}
          />,
        ),
      );

    it("shows the cart for another seller's active in-stock listing", () => {
      renderOne({ availableQuantity: 3 });
      expect(cartButtons()).toHaveLength(1);
    });

    it("shows the cart to a guest", () => {
      h.userId = null;
      renderOne({});
      expect(cartButtons()).toHaveLength(1);
    });

    it.each([
      ["sold", { productStatus: "sold" }],
      ["reserved", { productStatus: "reserved" }],
      ["inactive", { productStatus: "inactive" }],
      ["out of stock", { availableQuantity: 0 }],
      ["own", { sellerId: "me" }],
    ])("hides the cart for a %s listing", (_name, over) => {
      renderOne(over);
      expect(cartButtons()).toHaveLength(0);
    });

    // Same as every grid card: a line that can no longer be bought is
    // handled on the cart page, not by a card toggle.
    it("hides the cart for a sold-out listing already in the cart", () => {
      h.inCart = new Set(["x"]);
      renderOne({ availableQuantity: 0 });
      expect(cartButtons()).toHaveLength(0);
    });
  });
});
