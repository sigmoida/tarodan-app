// @vitest-environment jsdom
/** @format */

import { afterEach, describe, expect, it, vi } from "vitest";

// `seo.ts` next-intl routing'i çeker; yalnız kanonik origin gerekli.
vi.mock("@/lib/seo", () => ({ SITE_URL: "https://tarodan.com.tr" }));

import {
  buildShareTargets,
  canShareNatively,
  collectionShareUrl,
  copyText,
  favoritesShareUrl,
  isShareAbort,
  listingShareUrl,
  openShareWindow,
} from "./share";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildShareTargets", () => {
  const url = "https://tarodan.com.tr/listings/42";
  const text = "Hot Wheels & Co - 1.250,00 TL";
  const links = buildShareTargets({ url, text });
  const u = encodeURIComponent(url);
  const tx = encodeURIComponent(text);

  it("whatsapp: metin + url tek mesaj", () => {
    expect(links.whatsapp).toBe(
      `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    );
  });

  it("x: text ve url ayrı parametre", () => {
    expect(links.x).toBe(`https://x.com/intent/post?text=${tx}&url=${u}`);
  });

  it("facebook: yalnız url", () => {
    expect(links.facebook).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    );
  });

  it("telegram: url + text", () => {
    expect(links.telegram).toBe(`https://t.me/share/url?url=${u}&text=${tx}`);
  });

  it("özel karakterler (&, boşluk) kaçırılır", () => {
    expect(links.x).not.toContain(" ");
    expect(links.x).toContain("Hot%20Wheels%20%26%20Co");
  });

  it("text yoksa whatsapp yalnız url gönderir", () => {
    expect(buildShareTargets({ url }).whatsapp).toBe(
      `https://wa.me/?text=${u}`,
    );
  });
});

describe("kanonik paylaşım URL'leri", () => {
  it("ilan: origin + /listings/:id, locale öneki ve query yok", () => {
    expect(listingShareUrl("abc")).toBe("https://tarodan.com.tr/listings/abc");
  });

  it("koleksiyon: id ya da slug", () => {
    expect(collectionShareUrl("my-slug")).toBe(
      "https://tarodan.com.tr/collections/my-slug",
    );
  });

  it("favoriler: ürün kimlikleri ?ids= ile", () => {
    expect(favoritesShareUrl(["a", "b"])).toBe(
      "https://tarodan.com.tr/profile/favorites?ids=a,b",
    );
  });
});

describe("canShareNatively", () => {
  const stub = (coarse: boolean, share: unknown) => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: coarse && q === "(pointer: coarse)",
    }));
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
  };

  it("dokunmatik + navigator.share → true", () => {
    stub(true, vi.fn());
    expect(canShareNatively()).toBe(true);
  });

  it("masaüstü (pointer: fine) → false", () => {
    stub(false, vi.fn());
    expect(canShareNatively()).toBe(false);
  });

  it("navigator.share yok → false", () => {
    stub(true, undefined);
    expect(canShareNatively()).toBe(false);
  });
});

describe("isShareAbort", () => {
  it("yalnız AbortError iptaldir", () => {
    expect(isShareAbort(new DOMException("x", "AbortError"))).toBe(true);
    expect(isShareAbort(new DOMException("x", "NotAllowedError"))).toBe(false);
    expect(isShareAbort(null)).toBe(false);
  });
});

describe("openShareWindow", () => {
  it("noopener,noreferrer ile yeni sekme açar", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    openShareWindow("https://wa.me/?text=x");
    expect(open).toHaveBeenCalledWith(
      "https://wa.me/?text=x",
      "_blank",
      "noopener,noreferrer",
    );
  });
});

describe("copyText", () => {
  it("Clipboard API varsa onu kullanır", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await expect(copyText("link")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("link");
  });

  it("Clipboard API reddederse execCommand yedeği", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: exec,
      configurable: true,
    });
    await expect(copyText("link")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("Clipboard API yoksa ve yedek de başarısızsa false", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    await expect(copyText("link")).resolves.toBe(false);
  });
});
