import { describe, expect, it } from "vitest";
import { EMBED_DOCS, isEmbedDoc, isEmbedPath } from "./embed";

describe("isEmbedPath", () => {
  it("/app kökü ve altındaki yollar embed alanıdır", () => {
    expect(isEmbedPath("/app")).toBe(true);
    expect(isEmbedPath("/app/terms")).toBe(true);
    expect(isEmbedPath("/app/privacy/")).toBe(true);
  });

  it("yol sınırına bakar: önek eşleşmesi yetmez", () => {
    expect(isEmbedPath("/apple")).toBe(false);
    expect(isEmbedPath("/application/terms")).toBe(false);
    expect(isEmbedPath("/terms")).toBe(false);
    expect(isEmbedPath("/")).toBe(false);
  });
});

describe("isEmbedDoc", () => {
  it("6 belgenin hepsini tanır, başkasını tanımaz", () => {
    expect(EMBED_DOCS).toHaveLength(6);
    for (const doc of EMBED_DOCS) expect(isEmbedDoc(doc)).toBe(true);
    expect(isEmbedDoc("intellectual-property")).toBe(false);
    expect(isEmbedDoc("")).toBe(false);
  });
});
