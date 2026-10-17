/** @format */

import { describe, expect, it } from "vitest";
import { heroStoreLinkKind } from "@tarodan/types";
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
      store: null,
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

const IOS = "https://apps.apple.com/tr/app/id6786614139";
const ANDROID = "https://play.google.com/store/apps/details?id=com.tarodan.app";

describe("heroStoreLinkKind (@tarodan/types)", () => {
  it("App Store / iTunes / Google Play uygulama sayfasını tanır", () => {
    expect(heroStoreLinkKind(IOS)).toBe("appStore");
    expect(heroStoreLinkKind("https://itunes.apple.com/app/id1")).toBe(
      "appStore",
    );
    expect(heroStoreLinkKind(ANDROID)).toBe("googlePlay");
    expect(
      heroStoreLinkKind(
        " HTTPS://www.Play.Google.com/store/apps/details?id=x ",
      ),
    ).toBe("googlePlay");
  });

  it("başka adres, site içi yol ve Play'in uygulama dışı sayfası mağaza değildir", () => {
    for (const href of [
      "/listings",
      "https://play.google.com/store/movies",
      "https://play.google.com/store/appsx",
      "https://apple.com/app",
      "https://apps.apple.com.evil.example/app",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(heroStoreLinkKind(href)).toBeNull();
    }
  });
});

describe("resolveHeroCta — mağaza bağlantısı", () => {
  it("mağaza adresini yeni sekmede açılan mağaza CTA'sı olarak işaretler", () => {
    expect(resolveHeroCta(cta(IOS), "tr")).toEqual({
      label: "Keşfet",
      href: IOS,
      external: true,
      store: "appStore",
    });
    expect(resolveHeroCta(cta(ANDROID), "tr")?.store).toBe("googlePlay");
    expect(resolveHeroCta(cta("https://example.com"), "tr")?.store).toBeNull();
  });
});
