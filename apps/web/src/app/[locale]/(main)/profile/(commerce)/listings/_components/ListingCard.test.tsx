// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Listing } from "../_lib/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * My listings: the boost button in the bottom action row follows the listing
 * cards' one rule (`productCardAction`), the boosted badge is the cards'
 * `ProductBadge boosted`, and a boosted listing shows its end date.
 */

const h = vi.hoisted(() => ({ boostEnabled: true }));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: { user: { id: string } }) => unknown) =>
    select({ user: { id: "me" } }),
}));
vi.mock("@/components/boost/useBoostOffers", () => ({
  useBoostEnabled: () => h.boostEnabled,
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
    ...rest
  }: { href: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ListingCard from "./ListingCard";

const base: Listing = {
  id: "l1",
  title: "Camaro",
  price: 250,
  status: "active",
  createdAt: "2026-10-01T00:00:00Z",
};

let container: HTMLDivElement;
let root: Root;
const onBoost = vi.fn();

const render = (listing: Listing) =>
  act(() =>
    root.render(
      <ListingCard
        listing={listing}
        index={0}
        isDeleting={false}
        isDeactivating={false}
        isRenewing={false}
        onDelete={vi.fn()}
        onDeactivate={vi.fn()}
        onRenew={vi.fn()}
        onBoost={onBoost}
      />,
    ),
  );

const buttonTexts = () =>
  Array.from(container.querySelectorAll("button, a")).map(
    (el) => el.textContent ?? "",
  );

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  h.boostEnabled = true;
  onBoost.mockReset();
});

afterEach(() => act(() => root.unmount()));

describe("ListingCard boost action", () => {
  it("an active listing: Öne Çıkar between Düzenle and Pasife Al", () => {
    render(base);
    const texts = buttonTexts().filter((t) => t !== "Camaro");

    expect(texts).toEqual([
      "common.edit",
      "product.boostListing",
      "product.deactivateListing",
    ]);
    const boost = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "product.boostListing",
    )!;
    act(() => boost.click());
    expect(onBoost).toHaveBeenCalledWith(base);
    // The action row sits above the card's stretched title link.
    expect(boost.parentElement!.className).toContain("z-10");
  });

  it("a boosted listing: Süre Ekle, the boosted badge with its hint, the end date", () => {
    render({
      ...base,
      isBoosted: true,
      boostedUntil: "2026-11-12T10:00:00.000Z",
    });

    expect(buttonTexts()).toContain("product.extendBoost");
    const badge = container.querySelector<HTMLElement>(
      '[title="product.boostedBadgeHint"]',
    )!;
    expect(badge.textContent).toBe("product.boostedBadge");
    expect(badge.className).toContain("bg-warning-500");
    expect(container.textContent).toContain("product.boostEndsAt(12 Kas)");
  });

  it("boost sales off: no boost button (not a disabled one)", () => {
    h.boostEnabled = false;
    render({ ...base, isBoosted: true });

    expect(buttonTexts()).not.toContain("product.extendBoost");
    expect(buttonTexts()).not.toContain("product.boostListing");
    expect(buttonTexts()).toContain("common.edit");
  });

  it("an offline listing (paused boost): no boost button, no end date", () => {
    // A paused boost keeps its end; the card must not show it.
    render({
      ...base,
      status: "inactive",
      isBoosted: false,
      boostedUntil: "2026-11-12T10:00:00.000Z",
    });

    expect(buttonTexts()).not.toContain("product.boostListing");
    expect(buttonTexts()).not.toContain("product.extendBoost");
    expect(container.textContent).not.toContain("product.boostEndsAt");
  });
});
