import { describe, expect, it } from "vitest";
import {
  keepAttributeGroups,
  requiredGroupSlugsOf,
  sameAttributeSelections,
  splitAttributeGroups,
} from "./attribute-groups";

const opt = [{ slug: "x", label: "X" }];
const groups = [
  { slug: "scale", manufacturerSlug: null, isRequired: false, attributes: opt },
  {
    slug: "material",
    manufacturerSlug: null,
    isRequired: true,
    attributes: opt,
  },
  { slug: "color", manufacturerSlug: null, isRequired: true, attributes: opt },
  {
    slug: "vehicle_type",
    manufacturerSlug: null,
    isRequired: false,
    attributes: opt,
  },
  {
    slug: "nadirlik-bulunabilirlik",
    manufacturerSlug: null,
    isRequired: true,
    attributes: opt,
  },
  {
    slug: "kutu-durumu",
    manufacturerSlug: null,
    isRequired: false,
    attributes: opt,
  },
  {
    slug: "bos-zorunlu",
    manufacturerSlug: null,
    isRequired: true,
    attributes: [],
  },
  {
    slug: "hw-segment",
    manufacturerSlug: "hot-wheels",
    isRequired: false,
    attributes: opt,
  },
  {
    slug: "tomica-seri",
    manufacturerSlug: "tomica",
    isRequired: true,
    attributes: opt,
  },
];

describe("splitAttributeGroups", () => {
  it("genel özel grupları ayırır; sabit üçlü ve gizli grup hiçbir kovaya girmez", () => {
    const { global, scoped } = splitAttributeGroups(groups);
    expect(global.map((g) => g.slug)).toEqual([
      "nadirlik-bulunabilirlik",
      "kutu-durumu",
      "bos-zorunlu",
    ]);
    expect(scoped).toEqual([]);
  });

  it("yalnız seçili üreticinin gruplarını kapsamlı kovaya koyar", () => {
    const { scoped } = splitAttributeGroups(groups, "hot-wheels");
    expect(scoped.map((g) => g.slug)).toEqual(["hw-segment"]);
  });
});

describe("requiredGroupSlugsOf", () => {
  it("zorunlu işaretli ve seçeneği olan grupların slug'larını döner", () => {
    // `bos-zorunlu` seçeneksiz: sunucu da saymaz, form da saymaz.
    const { global } = splitAttributeGroups(groups);
    expect(requiredGroupSlugsOf(global)).toEqual(["nadirlik-bulunabilirlik"]);
  });
});

describe("keepAttributeGroups", () => {
  it("yalnız korunacak ve dolu grupları bırakır", () => {
    expect(
      keepAttributeGroups(
        {
          "nadirlik-bulunabilirlik": ["nadir"],
          "hw-segment": ["mainline"],
          "kutu-durumu": [],
        },
        ["nadirlik-bulunabilirlik", "kutu-durumu"],
      ),
    ).toEqual({ "nadirlik-bulunabilirlik": ["nadir"] });
  });

  it("boş girişte boş döner", () => {
    expect(keepAttributeGroups(undefined, ["x"])).toEqual({});
  });
});

describe("sameAttributeSelections", () => {
  it("boş dizileri yok sayarak karşılaştırır", () => {
    expect(sameAttributeSelections({ a: ["1"], b: [] }, { a: ["1"] })).toBe(
      true,
    );
    expect(sameAttributeSelections({ a: ["1"] }, { a: ["2"] })).toBe(false);
    expect(sameAttributeSelections({ a: ["1"] }, {})).toBe(false);
  });
});
