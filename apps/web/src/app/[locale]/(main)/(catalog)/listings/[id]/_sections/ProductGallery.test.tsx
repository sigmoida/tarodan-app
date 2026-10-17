// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ isTradeAvailable: true }));

vi.mock("../_context/ListingDetailContext", () => ({
  useListingDetail: () => ({
    listing: { id: "l1", title: "Camaro", status: "active" },
    t: (key: string) => key,
    images: ["/a.jpg"],
    // Bağlam hâlâ takas bayrağını taşır (ProductInfo butonu kullanır); galeri
    // artık onu okumamalı.
    isTradeAvailable: h.isTradeAvailable,
    activeImageIndex: 0,
    setActiveImageIndex: vi.fn(),
    openLightbox: vi.fn(),
    showMagnifier: false,
    setShowMagnifier: vi.fn(),
    magnifierPosition: { x: 0, y: 0 },
    imageContainerRef: null,
    setImageContainerRef: vi.fn(),
    zoomPreviewRef: { current: null },
    handleMagnifierMouseMove: vi.fn(),
    handleMagnifierMouseLeave: vi.fn(),
    open360View: vi.fn(),
  }),
}));
vi.mock("@/components/OptimizedImage", () => ({
  default: ({ alt }: { alt: string }) => <span data-img>{alt}</span>,
}));

import ProductGallery from "./ProductGallery";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // jsdom'da scrollIntoView yok.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ProductGallery", () => {
  it("takasa açık ilanda bile galeride takas rozeti çizmez", () => {
    h.isTradeAvailable = true;
    act(() => root.render(<ProductGallery />));
    expect(container.textContent).not.toContain("product.tradeAvailable");
    expect(container.querySelector("[data-img]")).not.toBeNull();
  });
});
