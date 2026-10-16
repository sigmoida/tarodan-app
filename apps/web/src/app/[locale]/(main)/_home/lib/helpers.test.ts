import { describe, expect, it } from "vitest";
import { toMarqueeItems, type MarqueeManufacturer } from "./helpers";

const mfr = (
  name: string,
  products?: number,
  over: Partial<MarqueeManufacturer> = {},
): MarqueeManufacturer => ({
  id: `id-${name.toLowerCase()}`,
  name,
  ...(products == null ? {} : { _count: { products } }),
  ...over,
});

describe("toMarqueeItems", () => {
  it("ilanı olmayan üreticileri şeritten düşürür (nav menüsüyle aynı kural)", () => {
    const items = toMarqueeItems([
      mfr("Bruder", 4),
      mfr("Bburago", 0),
      mfr("Norev", 1),
    ]);

    expect(items.map((i) => i.name)).toEqual(["Bruder", "Norev"]);
  });

  it("sayaç hiç gelmemişse süzmez", () => {
    expect(toMarqueeItems([mfr("Bruder"), mfr("Norev")])).toHaveLength(2);
  });

  it("link için id'yi taşır ve eksik alanları boş string yapar", () => {
    expect(
      toMarqueeItems([
        mfr("Bruder", 2, { logo: null, description: undefined }),
      ]),
    ).toEqual([{ id: "id-bruder", name: "Bruder", logoUrl: "", desc: "" }]);
  });
});
