// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Seller } from "../_lib/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The real next-intl translator over the shared catalog (tr).
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { getMessages } = await import("@tarodan/i18n");
  return {
    ...actual,
    useLocale: () => "tr",
    useTranslations: () =>
      actual.createTranslator({ locale: "tr", messages: getMessages("tr") }),
  };
});
// The `@/components/ui` barrel pulls in the `server-only` chain; only
// MetricCard is needed here.
vi.mock("@/components/ui", () => ({
  MetricCard: () => null,
}));
// Block/report menu needs React Query; not part of what is tested here.
vi.mock("@/components/UserActionsMenu", () => ({ default: () => null }));

import SellerHeader from "./SellerHeader";

const seller = (over: Partial<Seller>): Seller => ({
  id: "s1",
  username: "seller",
  displayName: "Seller",
  createdAt: "2025-01-01T00:00:00.000Z",
  isVerified: true,
  trust: { rating: 3.74, level: "fair", formulaVersion: 1 },
  sellerType: "individual",
  ...over,
});

let container: HTMLDivElement;
let root: Root;

function render(s: Seller) {
  act(() => {
    root.render(
      <SellerHeader
        seller={s}
        listingCount={0}
        isFollowing={false}
        followLoading={false}
        isOwnProfile={false}
        membershipDuration=""
        onMessage={() => {}}
        onFollow={() => {}}
        onReport={() => {}}
        onRequireAuth={() => true}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

// The visible badge is only a number, so gating is pinned on the badge button
// (its accessible name carries "Güven skoru"), not on the visible text.
const trustBadge = () =>
  container.querySelector('button[aria-label^="Güven skoru"]');

describe("SellerHeader badges", () => {
  it("shows Verified and only the trust number, no Premium or label", () => {
    // The API still sends `isPremium`; the header must ignore it.
    render({ ...seller({}), isPremium: true } as Seller);
    const text = container.textContent ?? "";
    expect(text).not.toContain("Premium");
    expect(text).toContain("Doğrulanmış");
    expect(text).toContain("3,74");
    expect(text).not.toContain("Güven skoru");
    expect(text).not.toContain("Orta");
    expect(trustBadge()?.textContent).toBe("3,74");
  });

  it("shows no trust badge when the API gates the score (trust null)", () => {
    render(seller({ trust: null }));
    const text = container.textContent ?? "";
    expect(trustBadge()).toBeNull();
    expect(text).not.toContain("Yeni satıcı");
    expect(text).not.toContain("Premium");
    expect(text).toContain("Doğrulanmış");
  });

  it("shows the review average in the locale format", () => {
    render(
      seller({
        trust: null,
        stats: {
          totalListings: 0,
          totalSales: 0,
          totalTrades: 0,
          totalRatings: 12,
          averageRating: 3.74,
        },
      }),
    );
    expect(container.textContent).toContain("3,7 (12)");
  });

  it("treats the platform seller like every seller (D5)", () => {
    render(
      seller({
        sellerType: "platform",
        trust: { rating: 4.1, level: "trusted", formulaVersion: 1 },
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Doğrulanmış");
    expect(trustBadge()?.textContent).toBe("4,10");
    expect(text).not.toContain("Resmi hesap");
  });

  it("shows no trust badge for a platform seller whose score is gated", () => {
    render(seller({ sellerType: "platform", trust: null }));
    expect(trustBadge()).toBeNull();
  });
});
