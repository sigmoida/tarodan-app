/** @format */

import { describe, expect, it } from "vitest";
import { resolveHeroCta } from "./heroView";

const cta = (href: string, label = { tr: "Keşfet", en: "Explore" }) => ({
  label,
  href,
});

describe("resolveHeroCta", () => {
  it("etiketi locale'e göre seçer", () => {
    expect(resolveHeroCta(cta("/listings"), "tr")?.label).toBe("Keşfet");
    expect(resolveHeroCta(cta("/listings"), "en")?.label).toBe("Explore");
  });

  it("site-içi yolu external=false döner", () => {
    expect(resolveHeroCta(cta("/collections"), "tr")).toEqual({
      label: "Keşfet",
      href: "/collections",
      external: false,
    });
  });

  it("http(s) adresini external=true döner", () => {
    expect(resolveHeroCta(cta("https://example.com/x"), "en")).toMatchObject({
      href: "https://example.com/x",
      external: true,
    });
  });

  it("güvensiz bağlantıda CTA'yı çizmez", () => {
    expect(resolveHeroCta(cta("javascript:alert(1)"), "tr")).toBeNull();
    expect(resolveHeroCta(cta("//evil.com"), "tr")).toBeNull();
    expect(resolveHeroCta(cta("data:text/html,x"), "tr")).toBeNull();
  });

  it("CTA yoksa null döner", () => {
    expect(resolveHeroCta(null, "tr")).toBeNull();
    expect(resolveHeroCta(undefined, "tr")).toBeNull();
  });
});
