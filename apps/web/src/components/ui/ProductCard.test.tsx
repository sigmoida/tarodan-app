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
// The price-row action has its own suite (ProductCardAction.test.tsx); here
// it only has to stay out of the card's link and out of the heart's way.
vi.mock("@/hooks/useCartToggle", () => ({
  useCartToggle: () => ({ inCart: false, isPending: false, toggle: vi.fn() }),
}));
vi.mock("@/components/boost/useBoostOffers", () => ({
  useBoostEnabled: () => true,
}));
vi.mock("@/components/boost/useBoostLauncher", () => ({
  useBoostLauncher: () => ({ open: vi.fn(), dialog: null }),
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
  container.querySelector<HTMLButtonElement>(
    'button[aria-label="product.favorite"]',
  );

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

describe("ProductCard rozet düzeni", () => {
  const rich: Product = {
    ...product,
    oldPrice: 400,
    price: 250,
    discountPercent: 38,
    isBoosted: true,
    tradeAvailable: true,
    feeCampaigns: ["Komisyonsuz"],
  };
  const badges = () =>
    container.querySelector<HTMLElement>('[data-testid="product-card-badges"]');

  it("grid: kalp sağ üstte, rozetler sol üstte (en fazla 2, indirim ilk)", () => {
    act(() => root.render(<ProductCard product={rich} />));
    expect(heart()!.className).toContain("top-1.5");
    expect(heart()!.className).toContain("right-1.5");
    expect(heart()!.className).not.toContain("bottom-");

    const stack = badges()!;
    expect(stack.className).toContain("left-1.5");
    expect(stack.className).toContain("top-1.5");
    const visual = Array.from(stack.children).filter(
      (c) => !c.classList.contains("sr-only"),
    );
    expect(visual).toHaveLength(2);
    expect(visual[0].textContent).toBe("%38");
    expect(visual[1].textContent).toBe("product.boostedBadge");
    expect(visual[1].getAttribute("title")).toBe("product.boostedBadgeHint");
    // Görsel rozetler aria-hidden; okuyucu tek özet metni (linkin içinde) okur.
    expect(visual.every((c) => c.getAttribute("aria-hidden") === "true")).toBe(
      true,
    );
    expect(container.querySelector("a .sr-only")!.textContent).toBe(
      " %38 product.discount, product.boostedBadgeHint",
    );
    // Sağ üstte ayrı indirim rozeti kalmadı (görsel + okuyucu metni).
    expect(container.textContent?.match(/%38/g)).toHaveLength(2);
  });

  it("grid: takas metni her genişlikte görünür (hidden sm:inline yok)", () => {
    act(() =>
      root.render(
        <ProductCard product={{ ...product, tradeAvailable: true }} />,
      ),
    );
    const label = badges()!.querySelector("span.truncate")!;
    expect(label.textContent).toBe("faq.trade");
    expect(label.className).not.toContain("hidden");
  });

  it("grid: overlayStart doluysa rozet yığını çizilmez", () => {
    act(() =>
      root.render(
        <ProductCard
          product={rich}
          overlayStart={<span data-start>SOLD</span>}
        />,
      ),
    );
    expect(badges()).toBeNull();
    expect(container.querySelector("[data-start]")).not.toBeNull();
  });

  it("grid: overlay (sağ üst) doluysa kalp çizilmez", () => {
    act(() =>
      root.render(
        <ProductCard product={rich} overlay={<span data-end>X</span>} />,
      ),
    );
    expect(heart()).toBeNull();
    expect(container.querySelector("[data-end]")).not.toBeNull();
  });

  it("grid: the badge text is part of the title link's name, the badges are not inside it", () => {
    act(() => root.render(<ProductCard product={rich} />));
    const link = container.querySelector("a")!;
    expect(link.contains(badges())).toBe(false);
    expect(link.textContent).toContain("%38");
    expect(link.textContent).toContain("product.boostedBadgeHint");
    expect(container.textContent).not.toContain("product.sponsored");
  });

  it("grid: yüzde 1'in altındaysa indirim rozeti çizilmez", () => {
    act(() =>
      root.render(
        <ProductCard product={{ ...product, price: 996, oldPrice: 1000 }} />,
      ),
    );
    expect(badges()).toBeNull();
    expect(container.textContent).not.toContain("%0");
  });

  it("liste: overlay kalbi gizlemez", () => {
    act(() =>
      root.render(
        <ProductCard
          product={rich}
          layout="list"
          overlay={<span data-end>X</span>}
        />,
      ),
    );
    expect(heart()).not.toBeNull();
  });

  it("liste: yüzde hesaplanır ve rozet metinleri linkin adına eklenir", () => {
    act(() =>
      root.render(
        <ProductCard
          product={{ ...rich, discountPercent: 0, oldPrice: 500 }}
          layout="list"
        />,
      ),
    );
    // 500 → 250 = %50
    expect(container.textContent).toContain("%50");
    expect(container.querySelector("a")!.textContent).toContain(
      "%50 product.discount, product.boostedBadgeHint, faq.trade",
    );
    // Görünen indirim rozeti okuyucudan gizlidir.
    const saleBadge = Array.from(
      container.querySelectorAll<HTMLElement>("[aria-hidden]"),
    ).find((el) => el.textContent === "%50");
    expect(saleBadge).toBeTruthy();
  });

  it.each(["grid", "list"] as const)(
    "%s: satılmış/rezerve/stoksuz ilanda takas rozeti çizilmez",
    (layout) => {
      for (const extra of [
        { status: "sold" },
        { status: "reserved" },
        { availableQuantity: 0 },
      ]) {
        act(() =>
          root.render(
            <ProductCard
              product={{ ...product, tradeAvailable: true, ...extra }}
              layout={layout}
            />,
          ),
        );
        expect(badges()).toBeNull();
        expect(container.querySelector(".absolute.top-1.left-1")).toBeNull();
        expect(container.querySelector("a")!.textContent).not.toContain(
          "faq.trade",
        );
      }
    },
  );

  it("liste: takas ikonu görselin sol üstünde, kalp sağ üstte, yalnız ikon", () => {
    act(() => root.render(<ProductCard product={rich} layout="list" />));
    const trade = container.querySelector<HTMLElement>(
      ".absolute.top-1.left-1",
    )!;
    expect(trade).not.toBeNull();
    expect(trade.className).not.toContain("right-1");
    expect(trade.textContent).toBe("");
    expect(heart()!.className).toContain("top-1.5");
    expect(heart()!.className).toContain("right-1.5");
    // Rozet yığını yok; indirim fiyatın yanında kalır, "Öne Çıkan" başlığın
    // üstünde (ipucuyla), "Sponsorlu" hiç yok.
    expect(badges()).toBeNull();
    expect(container.textContent).toContain("%38");
    const boosted = container.querySelector<HTMLElement>(
      '[title="product.boostedBadgeHint"]',
    )!;
    expect(boosted.textContent).toBe("product.boostedBadge");
    expect(boosted.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("a")!.contains(boosted)).toBe(false);
    expect(container.textContent).not.toContain("product.sponsored");
  });
});
