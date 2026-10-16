// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ProductDetailBadges from "./ProductDetailBadges";
import ProductStaticInfoView from "./ProductStaticInfoView";
import type { Listing } from "../_lib/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const t = (key: string) => key;

const listing: Listing = {
  id: "l1",
  title: "Camaro",
  description: "Açıklama",
  price: 150,
  oldPrice: 200,
  images: [],
  status: "active",
  tradeAvailable: true,
};

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

const row = () => container.querySelector('[data-testid="detail-badges"]');
const texts = () =>
  Array.from(row()?.children ?? []).map((el) => el.textContent);

describe("ProductDetailBadges", () => {
  it("sırayla %İndirim ve Takas rozetlerini çizer; 'indirim' kelimesi yok", () => {
    act(() => root.render(<ProductDetailBadges listing={listing} t={t} />));
    expect(texts()).toEqual(["%25", "faq.trade"]);
    expect(row()!.textContent).not.toMatch(/indirim/i);
    expect(row()!.querySelector("svg")).not.toBeNull();
  });

  it("satıldı ilanda Satıldı + indirim gösterir, takas yok", () => {
    act(() =>
      root.render(
        <ProductDetailBadges listing={{ ...listing, status: "sold" }} t={t} />,
      ),
    );
    expect(texts()).toEqual(["product.sold", "%25"]);
  });

  it("reserved ilanda takas rozeti yok", () => {
    act(() =>
      root.render(
        <ProductDetailBadges
          listing={{ ...listing, status: "reserved", oldPrice: null }}
          t={t}
        />,
      ),
    );
    expect(row()).toBeNull();
  });
});

describe("ProductStaticInfoView", () => {
  it("rozet satırı fiyatın altındadır; satıldı tek yerde (başlıkta değil) çizilir", () => {
    act(() =>
      root.render(
        <ProductStaticInfoView
          listing={{ ...listing, status: "sold" }}
          t={t}
        />,
      ),
    );
    const price = container.querySelector("p.text-primary-500")!;
    expect(price.nextElementSibling).toBe(row());
    expect(texts()).toEqual(["product.sold", "%25"]);
    // Başlık satırında artık rozet yok.
    expect(container.querySelector("h1")!.contains(row())).toBe(false);
    expect(container.querySelector("h1")!.textContent).toBe("Camaro");
    expect(container.innerHTML).not.toMatch(/indirim/i);
  });

  it("durum uyarısı rozet satırının hemen altında, görüntülenme satırından önce", () => {
    act(() =>
      root.render(
        <ProductStaticInfoView
          listing={{ ...listing, status: "sold" }}
          t={t}
        />,
      ),
    );
    const after = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const alertEl = Array.from(container.querySelectorAll("*")).find(
      (el) =>
        el.children.length === 0 && el.textContent === "product.statusSold",
    )!;
    const views = Array.from(container.querySelectorAll("span")).find((el) =>
      el.textContent?.includes("product.views"),
    )!;
    const description = Array.from(container.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && el.textContent === "Açıklama",
    )!;
    expect(alertEl).toBeTruthy();
    expect(after(row()!, alertEl)).toBe(true);
    expect(after(alertEl, views)).toBe(true);
    expect(after(alertEl, description)).toBe(true);
  });
});
