import {
  findMissingRequiredGroups,
  findMultiSelectedGlobalCustomGroups,
  type ResolvedAttributeRow,
} from "./attribute-selection-rules";

const rarity = {
  id: "g-rarity",
  slug: "nadirlik-bulunabilirlik",
  name: "Nadirlik/Bulunabilirlik",
  manufacturerSlug: null,
};
const hwSegment = {
  id: "g-hw",
  slug: "hw-segment",
  name: "Hot Wheels Segment",
  manufacturerSlug: "hot-wheels",
};
const color = {
  id: "g-color",
  slug: "color",
  name: "Renk",
  manufacturerSlug: null,
};

const row = (
  id: string,
  group: ResolvedAttributeRow["group"],
): ResolvedAttributeRow => ({ id, slug: id, group });

describe("findMultiSelectedGlobalCustomGroups", () => {
  it("genel özel grupta iki farklı değer ihlaldir", () => {
    expect(
      findMultiSelectedGlobalCustomGroups([
        row("nadir", rarity),
        row("yaygin", rarity),
      ]),
    ).toEqual(["Nadirlik/Bulunabilirlik"]);
  });

  it("aynı attribute iki kez gelirse ihlal değildir", () => {
    expect(
      findMultiSelectedGlobalCustomGroups([
        row("nadir", rarity),
        row("nadir", rarity),
      ]),
    ).toEqual([]);
  });

  it("üreticiye bağlı grup çoklu kalır", () => {
    expect(
      findMultiSelectedGlobalCustomGroups([
        row("mainline", hwSegment),
        row("premium", hwSegment),
      ]),
    ).toEqual([]);
  });

  it("sabit üçlü (renk) sayılmaz", () => {
    expect(
      findMultiSelectedGlobalCustomGroups([
        row("red", color),
        row("black", color),
      ]),
    ).toEqual([]);
  });
});

describe("findMissingRequiredGroups", () => {
  const required = [
    { slug: "nadirlik-bulunabilirlik", name: "Nadirlik/Bulunabilirlik" },
    { slug: "kutu-durumu", name: "Kutu Durumu" },
  ];

  it("seçimde temsil edilmeyen zorunlu grupları sırayla döner", () => {
    expect(findMissingRequiredGroups(required, [row("nadir", rarity)])).toEqual(
      ["Kutu Durumu"],
    );
  });

  it("hiç seçim yoksa hepsi eksiktir", () => {
    expect(findMissingRequiredGroups(required, [])).toEqual([
      "Nadirlik/Bulunabilirlik",
      "Kutu Durumu",
    ]);
  });

  it("zorunlu grup yoksa boş döner", () => {
    expect(findMissingRequiredGroups([], [])).toEqual([]);
  });
});
