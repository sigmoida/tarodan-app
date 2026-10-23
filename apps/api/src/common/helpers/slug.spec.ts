import {
  generateSlug,
  LISTING_SLUG_MAX_LENGTH,
  listingPath,
  listingPathSegment,
  listingSlug,
  parseListingParam,
  transliterateTurkish,
} from "@tarodan/types";
import { carModelSlug } from "./slug";

/**
 * Pins the shared slug rules in `@tarodan/types` (catalog slugs, listing
 * URLs). Catalog slugs are stored and unique: a changed output for an existing
 * name would make import and manual entry disagree, so these cases must keep
 * their exact values.
 */
describe("transliterateTurkish", () => {
  it("maps Turkish letters instead of dropping them", () => {
    expect(transliterateTurkish("Kırmızı Ölçek Şişe Ğ İ")).toBe(
      "Kirmizi Olcek Sise G I",
    );
    expect(transliterateTurkish("Âşık Îmâ Ûmit")).toBe("Asik Ima Umit");
  });
});

describe("generateSlug", () => {
  it("transliterates Turkish letters instead of deleting them", () => {
    // The old body used `[^\w\s-]` and produced "ahin" / "z-elik".
    expect(generateSlug("Şahin")).toBe("sahin");
    expect(generateSlug("Öz Çelik")).toBe("oz-celik");
    expect(generateSlug("Ağır Vasıta")).toBe("agir-vasita");
    expect(generateSlug("İzmir Döküm")).toBe("izmir-dokum");
    expect(generateSlug("ÇĞIİÖŞÜ")).toBe("cgiiosu");
  });

  it("reduces other Latin accents to the base letter", () => {
    expect(generateSlug("Citroën")).toBe("citroen");
    expect(generateSlug("Škoda")).toBe("skoda");
  });

  it("collapses separators to one hyphen", () => {
    expect(generateSlug("Mercedes-Benz")).toBe("mercedes-benz");
    expect(generateSlug("BMW   M3")).toBe("bmw-m3");
    expect(generateSlug("Alfa_Romeo")).toBe("alfa-romeo");
    expect(generateSlug("Rolls  --  Royce")).toBe("rolls-royce");
  });

  it("trims leading and trailing hyphens", () => {
    expect(generateSlug("  Ford  ")).toBe("ford");
    expect(generateSlug("-Opel-")).toBe("opel");
    expect(generateSlug("1:64 Ölçek!")).toBe("1-64-olcek");
  });

  it("returns an empty string when nothing survives", () => {
    // Callers treat this as "no slug could be derived from the name".
    expect(generateSlug("!!!")).toBe("");
    expect(generateSlug("   ")).toBe("");
  });

  it("is deterministic and case-insensitive", () => {
    expect(generateSlug("Hot Wheels")).toBe("hot-wheels");
    expect(generateSlug("hot wheels")).toBe(generateSlug("Hot Wheels"));
  });
});

describe("carModelSlug", () => {
  it("prefixes the model name with the brand slug", () => {
    expect(carModelSlug("dodge", "Charger")).toBe("dodge-charger");
    expect(carModelSlug("tofas", "Şahin")).toBe("tofas-sahin");
    expect(carModelSlug("bmw", "M3 Competition")).toBe("bmw-m3-competition");
  });

  it("is deterministic: same brand and name give one slug", () => {
    // CarModel.slug is @unique and the schema has no @@unique([brandId, name]):
    // uniqueness depends on this derivation staying deterministic.
    expect(carModelSlug("dodge", "Charger")).toBe(
      carModelSlug("dodge", "charger"),
    );
  });
});

const ID = "0b1e7a52-3c4d-4e5f-8a9b-1c2d3e4f5ac9";

describe("listingSlug", () => {
  it("builds a readable slug from a Turkish title", () => {
    expect(listingSlug("Ferrari F40 1:18 Bburago Kırmızı")).toBe(
      "ferrari-f40-1-18-bburago-kirmizi",
    );
    expect(listingSlug("İSTANBUL ŞEHİR HATLARI Vapur Maketi")).toBe(
      "istanbul-sehir-hatlari-vapur-maketi",
    );
  });

  it("drops emoji and punctuation without leaving stray hyphens", () => {
    expect(listingSlug("🔥 SÜPER FIRSAT!!! Hot Wheels — Datsun 510 🚗")).toBe(
      "super-firsat-hot-wheels-datsun-510",
    );
    expect(listingSlug("(Kutulu) 1/64 #5, «nadir»")).toBe(
      "kutulu-1-64-5-nadir",
    );
  });

  it("cuts a long title on the last word boundary within 80 characters", () => {
    const title =
      "Minichamps 1:43 Porsche 911 Carrera RS 2.7 Coupe 1973 Grand Prix Beyaz Yeşil Şeritli Sınırlı Üretim Koleksiyon";
    const slug = listingSlug(title);
    expect(slug).toBe(
      "minichamps-1-43-porsche-911-carrera-rs-2-7-coupe-1973-grand-prix-beyaz-yesil",
    );
    expect(slug.length).toBeLessThanOrEqual(LISTING_SLUG_MAX_LENGTH);
  });

  it("keeps a slug of exactly 80 characters whole", () => {
    const eighty = `${"a".repeat(39)} ${"b".repeat(40)}`;
    expect(listingSlug(eighty)).toBe(`${"a".repeat(39)}-${"b".repeat(40)}`);
    // The 81st character is a hyphen: the first 80 already end a word.
    expect(listingSlug(`${eighty} cc`)).toBe(
      `${"a".repeat(39)}-${"b".repeat(40)}`,
    );
  });

  it("drops a word the limit would split", () => {
    const title = `${"a".repeat(39)} ${"b".repeat(45)}`;
    expect(listingSlug(title)).toBe("a".repeat(39));
  });

  it("cuts a single word longer than the limit hard", () => {
    expect(listingSlug("x".repeat(120))).toBe("x".repeat(80));
  });

  it("gives no slug for an empty, symbol-only or non-Latin title", () => {
    expect(listingSlug("")).toBe("");
    expect(listingSlug(null)).toBe("");
    expect(listingSlug(undefined)).toBe("");
    expect(listingSlug("!!! 🔥🔥 ???")).toBe("");
    expect(listingSlug("модель машины")).toBe("");
  });

  it("gives no slug for a reserved word", () => {
    expect(listingSlug("Edit")).toBe("");
    expect(listingSlug("  NEW!! ")).toBe("");
    // Only the whole slug is reserved, not a word inside it.
    expect(listingSlug("New Beetle")).toBe("new-beetle");
  });
});

describe("listingPathSegment / listingPath", () => {
  it("joins the slug and the uuid", () => {
    expect(
      listingPathSegment({ id: ID, title: "Ferrari F40 1:18 Kırmızı" }),
    ).toBe(`ferrari-f40-1-18-kirmizi-${ID}`);
    expect(listingPath({ id: ID, title: "Ferrari F40 1:18 Kırmızı" })).toBe(
      `/listings/ferrari-f40-1-18-kirmizi-${ID}`,
    );
  });

  it("falls back to the bare uuid when the title gives no slug", () => {
    expect(listingPathSegment({ id: ID, title: "🔥🔥" })).toBe(ID);
    expect(listingPathSegment({ id: ID })).toBe(ID);
    expect(listingPath({ id: ID, title: "edit" })).toBe(`/listings/${ID}`);
  });

  it("round-trips through parseListingParam to the same uuid", () => {
    for (const title of ["Ferrari F40", "", "x".repeat(200), "Şahin 1:64"]) {
      expect(parseListingParam(listingPathSegment({ id: ID, title }))).toBe(ID);
    }
  });
});

describe("parseListingParam", () => {
  it("accepts a bare uuid of any version and case, unchanged", () => {
    expect(parseListingParam(ID)).toBe(ID);
    expect(parseListingParam(ID.toUpperCase())).toBe(ID.toUpperCase());
    // Seeded ids are not always v4.
    expect(parseListingParam("6f1e2d3c-4b5a-1c6d-0e7f-0a1b2c3d4e01")).toBe(
      "6f1e2d3c-4b5a-1c6d-0e7f-0a1b2c3d4e01",
    );
  });

  it("takes the trailing uuid and ignores any prefix", () => {
    expect(parseListingParam(`ferrari-f40-${ID}`)).toBe(ID);
    // A stale slug after a title edit still resolves.
    expect(parseListingParam(`old-title-${ID}`)).toBe(ID);
    // The uuid is the source of truth, even when the prefix holds another one.
    const other = "11111111-2222-3333-4444-555555555555";
    expect(parseListingParam(`${other}-${ID}`)).toBe(ID);
    expect(parseListingParam(`x-${ID}`)).toBe(ID);
  });

  it.each([
    ["empty", ""],
    ["not a uuid", "123; DROP"],
    ["slug only", "ferrari-f40"],
    ["uuid followed by a slug", `${ID}-ferrari`],
    ["no separator", `ferrari${ID}`],
    ["separator but no prefix", `-${ID}`],
    ["truncated uuid", `ferrari-${ID.slice(0, 35)}`],
    ["non-hex uuid", "ferrari-0b1e7a52-3c4d-4e5f-8a9b-1c2d3e4f5acz"],
    ["uuid with a trailing slash", `${ID}/`],
  ])("rejects %s", (_label, value) => {
    expect(parseListingParam(value)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parseListingParam(null)).toBeNull();
    expect(parseListingParam(undefined)).toBeNull();
  });
});
