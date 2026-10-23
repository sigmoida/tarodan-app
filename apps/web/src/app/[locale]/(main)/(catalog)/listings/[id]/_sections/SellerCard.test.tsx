// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ isPremium: true }));

vi.mock("../_context/ListingDetailContext", () => ({
  useListingDetail: () => ({
    t: (key: string) => key,
    listing: {
      id: "l1",
      seller: { id: "s1", username: "kaan", isPremium: h.isPremium },
    },
    isAuthenticated: true,
    isOwner: false,
    requireAuth: vi.fn(),
  }),
}));
// `@/components/ui` barrel'ı `server-only` zincirini çeker; yalnız SectionCard lazım.
vi.mock("@/components/ui", () => ({
  SectionCard: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
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

import { messages } from "@tarodan/i18n";
import SellerCard from "./SellerCard";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SellerCard package badge", () => {
  it("never shows a Premium badge, even for a premium seller", () => {
    h.isPremium = true;
    act(() => root.render(<SellerCard />));
    expect(container.textContent).not.toContain("seller.premiumBadge");
    expect(container.textContent).not.toContain("Premium");
  });

  it("shows no badge for a non-premium seller either", () => {
    h.isPremium = false;
    act(() => root.render(<SellerCard />));
    expect(container.textContent).not.toContain("seller.premiumBadge");
  });
});

describe("seller.premiumBadge catalog", () => {
  it("is removed from both catalogs", () => {
    expect(messages.tr.seller).not.toHaveProperty("premiumBadge");
    expect(messages.en.seller).not.toHaveProperty("premiumBadge");
  });
});
