import { describe, expect, it } from "vitest";
import { EMBED_DOCS, embedHref, isEmbedDoc, isEmbedPath } from "./embed";

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

describe("embedHref — belgeler arası linkler /app/ altında kalır", () => {
  it("embed belgelerinin yolunu /app karşılığına çevirir", () => {
    expect(embedHref("/privacy")).toBe("/app/privacy");
    expect(embedHref("/terms")).toBe("/app/terms");
    expect(embedHref("/distance-sales")).toBe("/app/distance-sales");
    expect(embedHref("/cookies")).toBe("/app/cookies");
    expect(embedHref("/seller-agreement")).toBe("/app/seller-agreement");
    expect(embedHref("/refund-policy")).toBe("/app/refund-policy");
  });

  it("sorgu ve çapayı korur", () => {
    expect(embedHref("/privacy#kvkk")).toBe("/app/privacy#kvkk");
    expect(embedHref("/terms?x=1")).toBe("/app/terms?x=1");
  });

  it("embed listesinde olmayan yollar normal yolda kalır", () => {
    expect(embedHref("/listings")).toBe("/listings");
    expect(embedHref("/contact")).toBe("/contact");
    expect(embedHref("/intellectual-property")).toBe("/intellectual-property");
    expect(embedHref("/privacy/extra")).toBe("/privacy/extra");
    expect(embedHref("https://example.com/privacy")).toBe(
      "https://example.com/privacy",
    );
    expect(embedHref("/app/terms")).toBe("/app/terms");
  });
});
