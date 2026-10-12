/** @format */

import { describe, expect, it } from "vitest";
import type { AdHotspot } from "@/lib/api/advertisements";
import { hotspotStyle, renderableHotspots } from "./hotspots";

const spot = (over: Partial<AdHotspot> = {}): AdHotspot => ({
  id: "h1",
  x: 0.1,
  y: 0.2,
  width: 0.5,
  height: 0.25,
  label: "Git",
  linkUrl: "/products",
  sortOrder: 0,
  ...over,
});

describe("hotspotStyle", () => {
  it("oranları yüzdeye çevirir", () => {
    expect(
      hotspotStyle(spot({ x: 0.25, y: 0.5, width: 0.5, height: 0.1 })),
    ).toEqual({ left: "25%", top: "50%", width: "50%", height: "10%" });
  });
});

describe("renderableHotspots", () => {
  it("güvenli olmayan bağlantıyı atlar, sırayı korur", () => {
    const list = renderableHotspots({
      imageUrl: "https://cdn/x.png",
      hotspots: [
        spot({ id: "a", linkUrl: "javascript:alert(1)" }),
        spot({ id: "b", linkUrl: "https://example.com" }),
        spot({ id: "c", linkUrl: "//evil.com" }),
        spot({ id: "d", linkUrl: "/cart" }),
      ],
    });
    expect(list.map((r) => [r.hotspot.id, r.href])).toEqual([
      ["b", "https://example.com"],
      ["d", "/cart"],
    ]);
  });

  it("görselsiz afişte ve bölge alanı yokken boş döner", () => {
    expect(renderableHotspots({ imageUrl: null, hotspots: [spot()] })).toEqual(
      [],
    );
    expect(
      renderableHotspots({ imageUrl: "x", hotspots: undefined as never }),
    ).toEqual([]);
  });
});
