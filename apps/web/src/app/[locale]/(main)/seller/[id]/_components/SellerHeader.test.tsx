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
  isPremium: true,
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

describe("SellerHeader badges", () => {
  it("shows Premium, Verified and the trust score for a premium seller", () => {
    render(seller({}));
    const text = container.textContent ?? "";
    expect(text).toContain("Premium");
    expect(text).toContain("Doğrulanmış");
    expect(text).toContain("Güven skoru 3,74/5 · Orta");
  });

  it("shows no trust badge when the API gates the score (trust null)", () => {
    render(seller({ isPremium: false, trust: null }));
    const text = container.textContent ?? "";
    expect(text).not.toContain("Güven skoru");
    expect(text).not.toContain("Premium");
    expect(text).toContain("Doğrulanmış");
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
    expect(text).toContain("Güven skoru 4,10/5 · Güvenilir");
    expect(text).not.toContain("Resmi hesap");
  });

  it("shows no trust badge for a platform seller whose score is gated", () => {
    render(seller({ sellerType: "platform", isPremium: false, trust: null }));
    expect(container.textContent).not.toContain("Güven skoru");
  });
});
