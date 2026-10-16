// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Kart ↔ kalp sözleşmesi: kalp kartın `<Link>`'inin İÇİNDE değildir (geçersiz
 * HTML olurdu), kalbe tıklama kartın linkini / tıklama sayacını tetiklemez, ve
 * kalp yalnız gezinilebilir ilan kartlarında, istenmediği yerde çizilmez.
 */

const h = vi.hoisted(() => ({
  toggle: vi.fn(),
  linkClick: vi.fn(),
  isPending: false,
}));

vi.mock("@/hooks/useWishlist", () => ({
  useProductFavorite: () => ({
    isFavorite: false,
    isPending: h.isPending,
    toggle: h.toggle,
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
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/OptimizedImage", () => ({
  default: ({ alt }: { alt: string }) => <span data-img>{alt}</span>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children?: ReactNode;
    onClick?: () => void;
  } & Record<string, unknown>) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        h.linkClick(href);
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

import ProductCard from "./ProductCard";

const product: Product = {
  id: "p1",
  title: "Hot Wheels '67 Camaro",
  price: 250,
  status: "active",
  seller: { id: "seller-1" },
};

let container: HTMLDivElement;
let root: Root;
const fetchSpy = vi.fn(() => Promise.resolve({}));

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.toggle.mockReset();
  h.linkClick.mockReset();
  h.isPending = false;
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const heart = () =>
  container.querySelector<HTMLButtonElement>("button[aria-pressed]");

describe.each(["grid", "list"] as const)("ProductCard (%s)", (layout) => {
  it("kalp linkin dışında; tıklaması kartı açmaz, sayacı artırmaz", () => {
    act(() => root.render(<ProductCard product={product} layout={layout} />));
    const link = container.querySelector("a")!;
    const button = heart()!;
    expect(button).not.toBeNull();
    expect(link.contains(button)).toBe(false);

    act(() => button.click());
    expect(h.toggle).toHaveBeenCalledTimes(1);
    expect(h.linkClick).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    // Kartın kendisi hâlâ ilana gider (ve tıklamayı sayar).
    act(() => link.click());
    expect(h.linkClick).toHaveBeenCalledWith("/listings/p1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("istek sürerken kalp meşgul görünür ama tıklama karta düşmez", () => {
    h.isPending = true;
    act(() => root.render(<ProductCard product={product} layout={layout} />));
    const button = heart()!;

    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    // Native `disabled` YOK: IconButton onu pointer-events-none yapar ve
    // tıklama alttaki ilan linkine düşerdi.
    expect(button.disabled).toBe(false);

    act(() => button.click());
    expect(h.linkClick).not.toHaveBeenCalled();
  });

  it("istek yokken meşguliyet özniteliği taşımaz", () => {
    act(() => root.render(<ProductCard product={product} layout={layout} />));
    expect(heart()!.hasAttribute("aria-busy")).toBe(false);
  });

  it("showFavorite={false} ile kalp çizilmez", () => {
    act(() =>
      root.render(
        <ProductCard product={product} layout={layout} showFavorite={false} />,
      ),
    );
    expect(heart()).toBeNull();
  });

  it("gezinmeyen kartta (href={null}) kalp çizilmez", () => {
    act(() =>
      root.render(
        <ProductCard product={product} layout={layout} href={null} />,
      ),
    );
    expect(heart()).toBeNull();
  });

  it("kendi ilanında kalp çizilmez", () => {
    act(() =>
      root.render(
        <ProductCard
          product={{ ...product, seller: { id: "me" } }}
          layout={layout}
        />,
      ),
    );
    expect(heart()).toBeNull();
  });
});
