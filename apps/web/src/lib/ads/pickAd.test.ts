/** @format */

import { describe, expect, it } from "vitest";
import { getRotationSeed, pickAd } from "./pickAd";

const ads = ["a", "b", "c", "d"];

describe("pickAd", () => {
  it("boş listede null döner", () => {
    expect(pickAd([], "header", 5)).toBeNull();
  });

  it("tek afişte hep onu seçer", () => {
    expect(pickAd(["x"], "footer", 123)).toBe("x");
  });

  it("aynı (liste, yuva, tohum) için kararlıdır", () => {
    expect(pickAd(ads, "header", 7)).toBe(pickAd(ads, "header", 7));
  });

  it("her zaman listeden bir öğe seçer", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(ads).toContain(pickAd(ads, "inline-1", seed));
    }
  });

  it("tohum değişince dönüşüm olur (tüm afişler sırayla çıkar)", () => {
    const seen = new Set<string | null>();
    for (let seed = 0; seed < ads.length; seed += 1) {
      seen.add(pickAd(ads, "header", seed));
    }
    expect(seen.size).toBe(ads.length);
  });

  it("yuva anahtarı seçimi kaydırır: farklı yuvalar her zaman aynı afişi almaz", () => {
    const picks = ["inline-0", "inline-1", "inline-2", "header", "footer"].map(
      (key) => pickAd(ads, key, 0),
    );
    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it("sayfa tohumu bir yüklemede sabittir", () => {
    expect(getRotationSeed()).toBe(getRotationSeed());
  });
});
