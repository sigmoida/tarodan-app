// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_STORE_LINKS } from "@/lib/appStoreLinks";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next-intl", () => {
  const t = (key: string) => key;
  t.rich = (key: string, tags: { accent: (c: ReactNode) => ReactNode }) => (
    <>
      {`${key} `}
      {tags.accent("accent")}
    </>
  );
  return { useTranslations: () => t };
});
vi.mock("next/image", () => ({
  default: (p: { alt: string; fill?: boolean; priority?: boolean }) => (
    <span
      data-testid="img"
      data-alt={p.alt}
      data-fill={String(Boolean(p.fill))}
      data-priority={String(Boolean(p.priority))}
    />
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import AppPromoSlide from "./AppPromoSlide";

describe("AppPromoSlide", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<AppPromoSlide />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("başlık tek h1, vurgulu kısım ayrı span", () => {
    const h1 = container.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe("title accent");
    expect(h1[0].querySelector("span")?.textContent).toBe("accent");
  });

  it("iki mağaza bağlantısı yeni sekmede açılır; ad görünen metinden gelir", () => {
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      APP_STORE_LINKS.map((s) => s.href),
    );
    for (const [i, a] of links.entries()) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      // Label-in-Name: aria-label yok, erişilebilir ad görünen metin +
      // ekran okuyucuya özel "yeni sekme" ipucu.
      expect(a.hasAttribute("aria-label")).toBe(false);
      expect(a.textContent).toContain(APP_STORE_LINKS[i].storeName);
      expect(a.querySelector(".sr-only")?.textContent).toBe("opensInNewTab");
    }
  });

  it("görsel sabit oranlı kutuyu doldurur (yer ayrılır), LCP için öncelikli", () => {
    const img = container.querySelector<HTMLElement>("[data-testid=img]");
    expect(img?.dataset.fill).toBe("true");
    expect(img?.parentElement?.className).toContain("aspect-[16/10]");
    expect(img?.dataset.alt).toBe("imageAlt");
    expect(img?.dataset.priority).toBe("true");
  });
});
