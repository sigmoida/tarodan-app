import { readFileSync } from "fs";
import { join } from "path";
import {
  COLOR_CATALOG,
  COLOR_GROUP_SLUG,
  matchColorSlug,
  normalizeColorToken,
  resolveColorsFromText,
  splitColorText,
  isProtectedAttributeGroup,
} from "./attribute-groups";

const OPTIONS = COLOR_CATALOG.map((entry) => ({
  slug: entry.slug,
  label: entry.name,
}));

describe("normalizeColorToken", () => {
  it("folds Turkish characters so spellings compare equal", () => {
    expect(normalizeColorToken("Kırmızı")).toBe("kirmizi");
    expect(normalizeColorToken("kirmizi")).toBe("kirmizi");
    expect(normalizeColorToken("  ÇOK   RENKLİ ")).toBe("cok renkli");
  });
});

describe("splitColorText", () => {
  it("splits the separators sellers actually type and drops repeats", () => {
    expect(splitColorText("Siyah / Kırmızı")).toEqual(["Siyah", "Kırmızı"]);
    expect(splitColorText("beyaz ve mavi")).toEqual(["beyaz", "mavi"]);
    expect(splitColorText("Mavi, mavi")).toEqual(["Mavi"]);
  });
});

describe("resolveColorsFromText", () => {
  it("resolves canonical names, aliases and multi-color text", () => {
    expect(resolveColorsFromText("Altın/Kahverengi", OPTIONS)).toEqual({
      slugs: ["gold", "brown"],
      labels: ["Altın", "Kahverengi"],
      unmatched: [],
    });
    expect(resolveColorsFromText("red", OPTIONS).slugs).toEqual(["red"]);
  });

  it("falls back to a single prefix match but never guesses between two", () => {
    expect(resolveColorsFromText("Mint Yeşili", OPTIONS).slugs).toEqual([
      "green",
    ]);
    expect(resolveColorsFromText("Zümrüt", OPTIONS)).toEqual({
      slugs: [],
      labels: [],
      unmatched: ["Zümrüt"],
    });
  });

  it("only offers colors that exist in the given options", () => {
    const limited = [{ slug: "black", label: "Siyah" }];
    expect(resolveColorsFromText("Kırmızı", limited).unmatched).toEqual([
      "Kırmızı",
    ]);
    expect(resolveColorsFromText("black", limited).slugs).toEqual(["black"]);
  });
});

describe("matchColorSlug", () => {
  it("maps known spellings and rejects unknown ones", () => {
    expect(matchColorSlug("Gümüş")).toBe("silver");
    expect(matchColorSlug("bilinmeyen")).toBeNull();
  });
});

describe("launch seed data", () => {
  // Launch seed'i JSON'dan okuyor, demo seed'i ve backfill koddaki katalogdan.
  // İkisi ayrışırsa canlıda formun sunduğu renklerle filtrenin bildiği renkler
  // farklı olur; bu test kopyayı senkron tutar.
  it("carries exactly the canonical color catalog", () => {
    const groups = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "..",
          "..",
          "..",
          "prisma",
          "data",
          "launch",
          "attribute-groups.json",
        ),
        "utf8",
      ),
    ) as Array<{ slug: string; values: Array<Record<string, unknown>> }>;
    const colorGroup = groups.find((group) => group.slug === COLOR_GROUP_SLUG);
    expect(colorGroup).toBeDefined();
    expect(
      colorGroup!.values.map((value) => ({
        slug: value.slug,
        name: value.value,
        hex: value.color ?? undefined,
      })),
    ).toEqual(
      COLOR_CATALOG.map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        hex: entry.hex,
      })),
    );
  });
});

/**
 * Bir grubun boşalmaya karşı korunup korunmadığı — silme/pasife alma
 * kapılarının dayandığı tek ölçüt.
 */
describe("isProtectedAttributeGroup", () => {
  it("formun zorunlu tuttuğu global gruplar bayraktan BAĞIMSIZ korunur", () => {
    // Canlıda scale ve material'ın isRequired'ı false; yalnız bayrağa
    // dayansaydık asıl korunması gerekenler korumasız kalırdı.
    for (const slug of ["scale", "material", "color"]) {
      expect(isProtectedAttributeGroup({ slug, isRequired: false })).toBe(true);
    }
  });

  it("isRequired işaretli her grup korunur — admin kendi grubunu koruyabilir", () => {
    expect(
      isProtectedAttributeGroup({ slug: "hw-series", isRequired: true }),
    ).toBe(true);
  });

  it("ne listede ne işaretli olan grup korunmaz", () => {
    expect(
      isProtectedAttributeGroup({ slug: "hw-series", isRequired: false }),
    ).toBe(false);
  });
});
