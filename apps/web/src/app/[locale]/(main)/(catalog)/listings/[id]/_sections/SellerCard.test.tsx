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

describe("SellerCard Premium badge", () => {
  it("sabit metin yerine seller.premiumBadge anahtarını kullanır", () => {
    h.isPremium = true;
    act(() => root.render(<SellerCard />));
    expect(container.textContent).toContain("seller.premiumBadge");
    expect(container.textContent).not.toContain("Premium");
  });

  it("premium olmayan satıcıda rozet yok", () => {
    h.isPremium = false;
    act(() => root.render(<SellerCard />));
    expect(container.textContent).not.toContain("seller.premiumBadge");
  });
});

describe("seller.premiumBadge catalog", () => {
  it("tr ve en katalogunda tanımlıdır", () => {
    expect(messages.tr.seller.premiumBadge).toBe("Premium");
    expect(messages.en.seller.premiumBadge).toBe("Premium");
  });
});
