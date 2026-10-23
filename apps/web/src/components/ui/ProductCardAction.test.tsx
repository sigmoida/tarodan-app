// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The listing card action through the real card: the viewer x listing matrix
 * of `productCardAction`, the cart toggle and its accessible state, the boost
 * entry, the boost end date, the stretched-link structure and the
 * server/hydration switch.
 */

const h = vi.hoisted(() => ({
  userId: null as string | null,
  boostEnabled: true,
  boostEnabledCalls: [] as Array<boolean | undefined>,
  inCart: false,
  cartPending: false,
  toggle: vi.fn(),
  openBoost: vi.fn(),
  linkClick: vi.fn(),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (
    selector: (s: {
      user: { id: string } | null;
      isAuthenticated: boolean;
    }) => unknown,
  ) =>
    selector({
      user: h.userId ? { id: h.userId } : null,
      isAuthenticated: !!h.userId,
    }),
}));
vi.mock("@/components/boost/useBoostOffers", () => ({
  useBoostEnabled: (opts?: { enabled?: boolean }) => {
    h.boostEnabledCalls.push(opts?.enabled);
    return h.boostEnabled;
  },
}));
vi.mock("@/components/boost/useBoostLauncher", () => ({
  useBoostLauncher: () => ({ open: h.openBoost, dialog: null }),
}));
vi.mock("@/hooks/useCartToggle", () => ({
  useCartToggle: () => ({
    inCart: h.inCart,
    isPending: h.cartPending,
    toggle: h.toggle,
  }),
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
vi.mock("next-intl", () => ({
  useLocale: () => "tr",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}(${Object.values(values).join("|")})` : key,
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

const TITLE = "Camaro";
const listing: Product = {
  id: "p1",
  title: TITLE,
  price: 250,
  status: "active",
  availableQuantity: 2,
  seller: { id: "seller-1" },
};
const own = { ...listing, seller: { id: "me" } };
const BOOST_END = "2026-11-12T10:00:00.000Z";

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  h.userId = null;
  h.boostEnabled = true;
  h.boostEnabledCalls = [];
  h.inCart = false;
  h.cartPending = false;
  h.toggle.mockReset();
  h.openBoost.mockReset();
  h.linkClick.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({})),
  );
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => {
  root = createRoot(container);
  act(() => root!.render(node));
};

const buttons = () =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter(
    (b) => b.getAttribute("aria-label") !== "product.favorite",
  );
/** The icon-only button of the action (the one with an aria-label). */
const iconButton = () => buttons().find((b) => b.hasAttribute("aria-label"));
/** The text button of the action. */
const textButton = () => buttons().find((b) => !b.hasAttribute("aria-label"));

describe("card action matrix (grid)", () => {
  it.each([
    ["guest", null, listing],
    ["another user", "buyer", listing],
  ])("%s on an active, in-stock listing: the cart action", (_, userId, p) => {
    h.userId = userId;
    render(<ProductCard product={p} />);

    expect(iconButton()!.getAttribute("aria-label")).toBe(
      `product.cardAction.addToCartAria(${TITLE})`,
    );
    expect(textButton()!.textContent).toBe("product.addToCart");
    // Not the viewer's listing: the boost switch is never asked for.
    expect(h.boostEnabledCalls.every((e) => e === false)).toBe(true);
  });

  it("the seller on an own, not boosted listing: Öne Çıkar", () => {
    h.userId = "me";
    render(<ProductCard product={own} />);

    expect(iconButton()!.getAttribute("aria-label")).toBe(
      `product.cardAction.boostAria(${TITLE})`,
    );
    expect(iconButton()!.className).toContain("bg-warning-500");
    expect(textButton()!.textContent).toBe("product.boostListing");
    expect(container.textContent).not.toContain("product.addToCart");
    expect(h.boostEnabledCalls).toContain(true);
  });

  it("the seller on an own boosted listing: Süre Ekle, and the end date", () => {
    h.userId = "me";
    render(
      <ProductCard
        product={{ ...own, isBoosted: true, boostedUntil: BOOST_END }}
      />,
    );

    expect(iconButton()!.getAttribute("aria-label")).toBe(
      `product.cardAction.extendAria(${TITLE})`,
    );
    expect(textButton()!.textContent).toBe("product.extendBoost");
    expect(container.textContent).toMatch(/product\.boostEndsAt\(12 Kas\)/);
  });

  it("an own listing whose boost is paused (listing offline): no action", () => {
    h.userId = "me";
    render(
      <ProductCard
        product={{
          ...own,
          status: "inactive",
          isBoosted: false,
          // A paused boost keeps its end; the card must not show it.
          boostedUntil: BOOST_END,
        }}
      />,
    );
    expect(buttons()).toHaveLength(0);
    expect(container.textContent).not.toContain("product.boostEndsAt");
  });

  it("an own active listing whose boost ended: Öne Çıkar, no end date", () => {
    h.userId = "me";
    render(
      <ProductCard
        product={{ ...own, isBoosted: false, boostedUntil: BOOST_END }}
      />,
    );
    expect(textButton()!.textContent).toBe("product.boostListing");
    expect(container.textContent).not.toContain("product.boostEndsAt");
  });

  it("a listing without a quantity (unlimited stock): the cart action", () => {
    h.userId = "buyer";
    const { availableQuantity: _omit, ...unlimited } = listing;
    render(<ProductCard product={unlimited} />);
    expect(textButton()!.textContent).toBe("product.addToCart");
  });

  it("boost sales off: no action on an own listing, the cart stays for others", () => {
    h.boostEnabled = false;
    h.userId = "me";
    render(<ProductCard product={own} />);
    expect(buttons()).toHaveLength(0);

    act(() => root!.render(<ProductCard product={listing} />));
    expect(textButton()!.textContent).toBe("product.addToCart");
  });

  it.each([
    ["sold", { status: "sold" }],
    ["reserved", { status: "reserved" }],
    ["out of stock", { availableQuantity: 0 }],
  ])("%s listing: no action, the price row keeps its height", (_, extra) => {
    h.userId = "buyer";
    render(<ProductCard product={{ ...listing, ...extra }} />);

    expect(buttons()).toHaveLength(0);
    expect(container.querySelector(".min-h-8")).not.toBeNull();
  });

  it("another user's boosted listing shows no end date", () => {
    h.userId = "buyer";
    render(
      <ProductCard
        product={{ ...listing, isBoosted: true, boostedUntil: BOOST_END }}
      />,
    );
    expect(container.textContent).not.toContain("product.boostEndsAt");
  });

  it("no action on a non-navigating card or a card with its own footer", () => {
    h.userId = "buyer";
    render(<ProductCard product={listing} href={null} />);
    expect(buttons()).toHaveLength(0);

    act(() =>
      root!.render(
        <ProductCard product={listing} footer={<span data-footer />} />,
      ),
    );
    expect(buttons()).toHaveLength(0);
    expect(container.querySelector("[data-footer]")).not.toBeNull();
  });
});

describe("cart toggle", () => {
  it("icon-only names the listing, says its state and switches by card width", () => {
    render(<ProductCard product={listing} />);
    const icon = iconButton()!;

    expect(icon.getAttribute("aria-pressed")).toBe("false");
    expect(icon.getAttribute("title")).toBe(icon.getAttribute("aria-label"));
    // Not in the cart: the outline icon.
    expect(icon.querySelector("svg")!.getAttribute("fill")).toBe("none");
    expect(icon.className).toContain("@card-wide:hidden");
    expect(textButton()!.className).toContain("hidden");
    expect(textButton()!.className).toContain("@card-wide:inline-flex");
    // The card root is the container the switch reads.
    expect(
      (container.firstElementChild as HTMLElement).className.split(" "),
    ).toContain("@container");
  });

  it("not in the cart: outline primary, icon and text alike", () => {
    render(<ProductCard product={listing} />);

    for (const button of [iconButton()!, textButton()!]) {
      const classes = button.className.split(" ");
      expect(classes).toContain("border-primary-600");
      expect(classes).toContain("text-primary-700");
      expect(classes).not.toContain("bg-primary-600");
      expect(classes).not.toContain("text-inverted");
    }
    expect(textButton()!.querySelector("svg")!.getAttribute("fill")).toBe(
      "none",
    );
  });

  it("in the cart: remove label, pressed, filled primary", () => {
    h.inCart = true;
    render(<ProductCard product={listing} />);
    const icon = iconButton()!;

    expect(icon.getAttribute("aria-label")).toBe(
      `product.cardAction.removeFromCartAria(${TITLE})`,
    );
    expect(icon.getAttribute("aria-pressed")).toBe("true");
    for (const button of [icon, textButton()!]) {
      const classes = button.className.split(" ");
      expect(classes).toContain("bg-primary-600");
      expect(classes).toContain("text-inverted");
      expect(classes).not.toContain("border-primary-600");
      expect(classes).not.toContain("text-danger-600");
    }
    // In the cart: the solid icon, so colour is not the only cue.
    expect(icon.querySelector("svg")!.getAttribute("fill")).toBe(
      "currentColor",
    );
    expect(textButton()!.textContent).toBe("product.removeFromCart");
  });

  it("a click toggles the cart and never opens the listing", () => {
    render(<ProductCard product={listing} />);
    act(() => iconButton()!.click());
    act(() => textButton()!.click());

    expect(h.toggle).toHaveBeenCalledTimes(2);
    expect(h.linkClick).not.toHaveBeenCalled();
  });

  it("busy while the write runs, without native disabled", () => {
    h.cartPending = true;
    render(<ProductCard product={listing} />);
    const icon = iconButton()!;

    expect(icon.getAttribute("aria-busy")).toBe("true");
    // Native `disabled` would let the click fall through to the card link.
    expect(icon.disabled).toBe(false);
  });

  it("list layout: icon below xs, text under the price from xs", () => {
    render(<ProductCard product={listing} layout="list" />);

    expect(iconButton()!.className).toContain("xs:hidden");
    expect(textButton()!.className).toContain("xs:inline-flex");
    expect(container.querySelector("a")!.contains(iconButton()!)).toBe(false);
    // The action sits above the row's stretched link.
    expect(iconButton()!.parentElement!.className).toContain("z-10");
  });
});

describe("boost entry", () => {
  it("opens the shared boost dialog for the listing", () => {
    h.userId = "me";
    render(
      <ProductCard
        product={{ ...own, isBoosted: true, boostedUntil: BOOST_END }}
      />,
    );
    act(() => textButton()!.click());

    expect(h.openBoost).toHaveBeenCalledWith({
      id: "p1",
      title: TITLE,
      boostedUntil: BOOST_END,
    });
    expect(h.linkClick).not.toHaveBeenCalled();
  });

  it("the icon-only button on a narrow card opens it too", () => {
    h.userId = "me";
    render(<ProductCard product={own} />);
    act(() => iconButton()!.click());

    expect(h.openBoost).toHaveBeenCalledTimes(1);
    expect(h.openBoost).toHaveBeenCalledWith({
      id: "p1",
      title: TITLE,
      boostedUntil: null,
    });
    expect(h.linkClick).not.toHaveBeenCalled();
  });
});

describe("stretched title link", () => {
  it("is the card's one link; the action, heart and image are outside it", () => {
    render(<ProductCard product={{ ...listing, isBoosted: true }} />);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    const link = links[0];

    expect(link.className).toContain("after:absolute");
    expect(link.className).toContain("after:inset-0");
    expect(link.className).toContain("focus-visible:after:ring-2");
    // Inset: the card clips its overflow, an outer ring would not show.
    expect(link.className).toContain("focus-visible:after:ring-inset");
    expect(link.textContent).toContain(TITLE);
    for (const button of container.querySelectorAll("button")) {
      expect(link.contains(button)).toBe(false);
    }
    expect(link.querySelector("[data-img]")).toBeNull();
    // The action sits above the stretched link.
    expect(iconButton()!.parentElement!.className).toContain("z-10");
  });
});

describe("every grid's card props", () => {
  // The prop sets the card's consumers pass (tsc checks the types; this
  // checks each still renders its title, price and the expected action).
  it.each([
    ["/listings, seller store (grid)", { layout: "grid" as const }, true],
    ["/listings (list)", { layout: "list" as const }, true],
    ["related, cart similar", { href: "/listings/p1" }, true],
    ["manufacturer preview", { showMeta: false }, true],
    [
      "collection item",
      {
        showMeta: false,
        overlay: <span data-x />,
        overlayStart: <span data-y />,
      },
      true,
    ],
    ["collection custom item", { href: null }, false],
    ["favorites", { showFavorite: false, footer: <span data-f /> }, false],
  ])("%s", (_, props, hasAction) => {
    h.userId = "buyer";
    render(<ProductCard product={listing} {...props} />);

    expect(container.textContent).toContain(TITLE);
    expect(container.textContent).toContain("250,00 TL");
    expect(textButton() !== undefined).toBe(hasAction);
  });
});

describe("server render and hydration", () => {
  it("renders the cart action on the server, then switches an own listing to boost without a mismatch", async () => {
    h.userId = "me";
    const card = <ProductCard product={own} />;
    const html = renderToString(card);

    // The server does not know the viewer: guest action.
    expect(html).toContain("product.addToCart");
    expect(html).not.toContain("product.boostListing");

    container.innerHTML = html;
    const errors: unknown[] = [];
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await act(async () => {
      root = hydrateRoot(container, card, {
        onRecoverableError: (error) => errors.push(error),
      });
    });

    expect(errors).toEqual([]);
    expect(
      consoleError.mock.calls.some((args) =>
        String(args[0]).toLowerCase().includes("hydrat"),
      ),
    ).toBe(false);
    consoleError.mockRestore();
    expect(textButton()!.textContent).toBe("product.boostListing");
  });

  it("keeps the in-cart state for after hydration (the guest cart is local)", async () => {
    h.inCart = true;
    const card = <ProductCard product={listing} />;
    const html = renderToString(card);
    expect(html).toContain("product.addToCart");

    container.innerHTML = html;
    const errors: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(container, card, {
        onRecoverableError: (error) => errors.push(error),
      });
    });

    expect(errors).toEqual([]);
    expect(textButton()!.textContent).toBe("product.removeFromCart");
  });
});
