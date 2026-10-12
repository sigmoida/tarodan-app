// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdHotspot, Advertisement } from "@/lib/api/advertisements";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const track = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/advertisements", () => ({ trackAdEvent: track }));
vi.mock("@/hooks/useAdImpression", () => ({ useAdImpression: () => undefined }));
vi.mock("@/components/OptimizedImage", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="img">{alt}</span>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import AdCreative from "./AdCreative";

const spot = (over: Partial<AdHotspot>): AdHotspot => ({
  id: "h1",
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.4,
  label: "Bölge",
  linkUrl: "/products",
  sortOrder: 0,
  ...over,
});

const ad = (over: Partial<Advertisement>): Advertisement => ({
  id: "ad1",
  title: "Afiş",
  imageUrl: "https://cdn/x.png",
  linkUrl: null,
  hotspots: [],
  content: null,
  altText: null,
  width: 970,
  height: 250,
  position: "header",
  deviceType: "all",
  campaign: null,
  ...over,
});

describe("AdCreative hotspots", () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (node: React.ReactNode) =>
    act(() => {
      root.render(node);
    });

  beforeEach(() => {
    track.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("görselli afişte yalnız bölgeler bağlantıdır, dıştaki sarmalayıcı yoktur", () => {
    render(
      <AdCreative
        ad={ad({
          // Eski veride linkUrl kalmış olsa bile görsel sarmalanmaz.
          linkUrl: "https://example.com/all",
          hotspots: [
            spot({ id: "a", linkUrl: "/products" }),
            spot({ id: "b", linkUrl: "https://example.com", x: 0.5 }),
          ],
        })}
        position="header"
      />,
    );

    const anchors = host.querySelectorAll("a");
    expect(anchors).toHaveLength(2);
    anchors.forEach((a) => expect(a.contains(host.querySelector("img, [data-testid=img]"))).toBe(false));
  });

  it("bölgeyi yüzde olarak konumlar ve dış bağlantıyı yeni sekmede açar", () => {
    render(
      <AdCreative
        ad={ad({
          hotspots: [
            spot({ id: "a", linkUrl: "/products" }),
            spot({ id: "b", linkUrl: "https://example.com", x: 0.5 }),
          ],
        })}
        position="header"
      />,
    );

    const [internal, external] = Array.from(host.querySelectorAll("a"));
    expect(internal.style.left).toBe("10%");
    expect(internal.style.top).toBe("20%");
    expect(internal.style.width).toBe("30%");
    expect(internal.style.height).toBe("40%");
    expect(internal.getAttribute("aria-label")).toBe("Bölge");
    expect(internal.getAttribute("rel")).toBe("sponsored");
    expect(external.getAttribute("target")).toBe("_blank");
    expect(external.getAttribute("rel")).toBe("sponsored noopener noreferrer");
  });

  it("güvenli olmayan bağlantılı bölgeyi atlar", () => {
    render(
      <AdCreative
        ad={ad({
          hotspots: [
            spot({ id: "a", linkUrl: "javascript:alert(1)" }),
            spot({ id: "b", linkUrl: "/ok" }),
          ],
        })}
        position="header"
      />,
    );
    const anchors = host.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute("href")).toBe("/ok");
  });

  it("bölgesiz görselli afiş tıklanamaz", () => {
    render(<AdCreative ad={ad({ hotspots: [] })} position="header" />);
    expect(host.querySelectorAll("a")).toHaveLength(0);
  });

  it("tıklama bölge kimliğiyle sayılır ve onNavigate çağrılır", () => {
    const onNavigate = vi.fn();
    render(
      <AdCreative
        ad={ad({ hotspots: [spot({ id: "hx", linkUrl: "/products" })] })}
        position="popup"
        onNavigate={onNavigate}
      />,
    );
    const anchor = host.querySelector("a")!;
    anchor.addEventListener("click", (e) => e.preventDefault());
    act(() => anchor.click());
    expect(track).toHaveBeenCalledWith("ad1", "click", "hx");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("görselsiz afişte tek bağlantı korunur ve bölgesiz sayılır", () => {
    render(
      <AdCreative
        ad={ad({ imageUrl: null, linkUrl: "/campaign", content: "Metin" })}
        position="header"
      />,
    );
    const anchors = host.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute("href")).toBe("/campaign");
    act(() => {
      anchors[0].addEventListener("click", (e) => e.preventDefault());
      anchors[0].click();
    });
    expect(track).toHaveBeenCalledWith("ad1", "click");
  });
});
