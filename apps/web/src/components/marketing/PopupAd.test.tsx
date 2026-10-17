// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "@tarodan/ui";
import type { AdHotspot, Advertisement } from "@/lib/api/advertisements";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const popup = vi.hoisted(() => ({
  ad: null as Advertisement | null,
  close: vi.fn(),
}));
const track = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/usePopupAd", () => ({
  usePopupAd: () => ({ ad: popup.ad, close: popup.close }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/api/advertisements", () => ({ trackAdEvent: track }));
vi.mock("@/hooks/useAdImpression", () => ({
  useAdImpression: () => undefined,
}));
vi.mock("@/components/OptimizedImage", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="img">{alt}</span>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: React.ReactNode } & Record<
    string,
    unknown
  >) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PopupAd from "./PopupAd";

const spot = (over: Partial<AdHotspot> = {}): AdHotspot => ({
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

const ad = (over: Partial<Advertisement> = {}): Advertisement => ({
  id: "ad1",
  title: "Ekim kampanyası",
  imageUrl: "https://cdn/p.png",
  linkUrl: null,
  hotspots: [],
  content: null,
  altText: null,
  width: 600,
  height: 600,
  position: "popup",
  platform: "web",
  popupFrequency: "until_dismissed",
  popupVersion: 1,
  campaign: null,
  ...over,
});

describe("PopupAd (Modal media)", () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (node: React.ReactNode) =>
    act(() => {
      root.render(node);
    });
  const dialog = () =>
    document.body.querySelector<HTMLElement>('[role="dialog"]');

  beforeEach(() => {
    popup.ad = null;
    popup.close.mockClear();
    track.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("reklam yokken hiçbir şey çizmez", () => {
    render(<PopupAd />);
    expect(dialog()).toBeNull();
  });

  it("sade çerçeve: başlık satırı yok, başlık yalnız ekran okuyucuda, X görselin üstünde", () => {
    popup.ad = ad();
    render(<PopupAd />);

    const el = dialog();
    expect(el).not.toBeNull();
    expect(el!.querySelector(".border-b")).toBeNull();
    expect(el!.className).toContain("bg-transparent");
    expect(el!.className).not.toContain("bg-surface-elevated");

    const title = el!.querySelector("h2");
    expect(title?.textContent).toBe("Ekim kampanyası");
    expect(title?.className).toContain("sr-only");

    const close = el!.querySelector<HTMLButtonElement>(
      'button[aria-label="common.close"]',
    );
    expect(close).not.toBeNull();
    expect(close!.className).toContain("absolute");
    expect(close!.className).toContain("rounded-full");
    act(() => close!.click());
    expect(popup.close).toHaveBeenCalled();
  });

  it("tek bölgeli afişte görselin tamamı o bağlantıdır; tık bölge kimliğiyle sayılır", () => {
    popup.ad = ad({ hotspots: [spot({ id: "only", linkUrl: "/kampanya" })] });
    render(<PopupAd />);

    const anchors = dialog()!.querySelectorAll<HTMLAnchorElement>("a");
    expect(anchors).toHaveLength(1);
    const [link] = Array.from(anchors);
    expect(link.getAttribute("href")).toBe("/kampanya");
    expect(link.style.left).toBe("0%");
    expect(link.style.top).toBe("0%");
    expect(link.style.width).toBe("100%");
    expect(link.style.height).toBe("100%");

    act(() => link.click());
    expect(track).toHaveBeenCalledWith("ad1", "click", "only");
    expect(popup.close).toHaveBeenCalled();
  });

  it("çok bölgeli afişte bölgeler olduğu gibi kalır", () => {
    popup.ad = ad({
      hotspots: [spot({ id: "a" }), spot({ id: "b", x: 0.5 })],
    });
    render(<PopupAd />);

    const anchors = Array.from(
      dialog()!.querySelectorAll<HTMLAnchorElement>("a"),
    );
    expect(anchors).toHaveLength(2);
    expect(anchors[0].style.left).toBe("10%");
    expect(anchors[0].style.width).toBe("30%");
    expect(anchors[1].style.left).toBe("50%");
  });

  it("metin afişi yüzey zemininde, kendi gövdesiyle çizilir", () => {
    popup.ad = ad({ imageUrl: null, linkUrl: "/x", content: "Detay" });
    render(<PopupAd />);
    const el = dialog()!;
    expect(el.textContent).toContain("Detay");
    expect(el.querySelector(".bg-surface-elevated")).not.toBeNull();
  });
});

describe("Modal varsayılan çerçeve (admin de kullanıyor) değişmedi", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("başlık satırı, kenarlık, dolgulu gövde ve yüzey arka planı yerinde", () => {
    act(() => {
      root.render(
        <Modal
          isOpen
          onClose={() => undefined}
          title="Başlık"
          closeLabel="Kapat"
        >
          <p>gövde</p>
        </Modal>,
      );
    });
    const el = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(el.className).toContain("bg-surface-elevated");
    const header = el.querySelector(".border-b");
    expect(header).not.toBeNull();
    const title = header!.querySelector("h2");
    expect(title?.textContent).toBe("Başlık");
    expect(title?.className).not.toContain("sr-only");
    expect(header!.querySelector('button[aria-label="Kapat"]')).not.toBeNull();
    expect(el.querySelector(".px-6.py-5")?.textContent).toBe("gövde");
  });
});
