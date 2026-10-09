import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  AD_POSITIONS,
  adFormToPayload,
  adSchema,
  adToForm,
  emptyAdForm,
  isValidAdLink,
  positionLabels,
  type Ad,
} from "./types";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;

const filled = {
  ...emptyAdForm,
  title: " Yaz ",
  imageUrl: "https://cdn/x.png",
  linkUrl: "/kampanya",
  content: "Merhaba",
  altText: "alt",
  width: 970,
  height: 250,
  displayOrder: "2",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  discountId: "d1",
};

describe("positions", () => {
  it("is exactly topbar/header/footer/inline/popup", () => {
    expect([...AD_POSITIONS]).toEqual([
      "topbar",
      "header",
      "footer",
      "inline",
      "popup",
    ]);
    expect(Object.keys(positionLabels(t))).toEqual([...AD_POSITIONS]);
  });
});

describe("adFormToPayload", () => {
  it("create: omits emptied fields", () => {
    const p = adFormToPayload(emptyAdForm, "create") as Record<string, unknown>;
    for (const k of [
      "imageUrl",
      "linkUrl",
      "content",
      "altText",
      "width",
      "height",
      "startDate",
      "endDate",
      "discountId",
    ]) {
      expect(p[k]).toBeUndefined();
    }
  });

  it("update: sends null for emptied fields (incl. removed image)", () => {
    const p = adFormToPayload({ ...emptyAdForm, title: "x" }, "update");
    expect(p).toMatchObject({
      imageUrl: null,
      linkUrl: null,
      content: null,
      altText: null,
      width: null,
      height: null,
      startDate: null,
      endDate: null,
      discountId: null,
    });
  });

  it("sends filled values with Istanbul-offset dates in both modes", () => {
    for (const mode of ["create", "update"] as const) {
      expect(adFormToPayload(filled, mode)).toMatchObject({
        title: "Yaz",
        imageUrl: "https://cdn/x.png",
        linkUrl: "/kampanya",
        content: "Merhaba",
        width: 970,
        height: 250,
        displayOrder: 2,
        startDate: "2026-07-01T00:00:00.000+03:00",
        endDate: "2026-07-31T23:59:59.999+03:00",
        discountId: "d1",
      });
    }
  });
});

describe("adToForm", () => {
  it("converts stored instants to the Istanbul calendar day", () => {
    const ad = {
      title: "a",
      position: "topbar",
      deviceType: "all",
      displayOrder: 0,
      isActive: true,
      startDate: "2026-06-30T21:00:00.000Z",
      endDate: "2026-07-31T20:59:59.999Z",
      discountId: null,
    } as Ad;
    expect(adToForm(ad)).toMatchObject({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      discountId: "",
    });
  });
});

describe("isValidAdLink", () => {
  it.each(["", "https://a.com/x", "http://a.com", "/kategori/araba"])(
    "accepts %j",
    (v) => expect(isValidAdLink(v)).toBe(true),
  );
  it.each(["//evil.com", "/\\evil.com", "javascript:alert(1)", "a.com", "ftp://a"])(
    "rejects %j",
    (v) => expect(isValidAdLink(v)).toBe(false),
  );
});

describe("adSchema", () => {
  const schema = adSchema(t);
  const msgs = (v: unknown) => {
    const r = schema.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("accepts a valid form", () => {
    expect(schema.safeParse(filled).success).toBe(true);
  });

  it("rejects end before start, accepts same day", () => {
    expect(msgs({ ...filled, startDate: "2026-07-10", endDate: "2026-07-09" })).toContain(
      "admin.marketing.ads.validation.endBeforeStart",
    );
    expect(
      schema.safeParse({ ...filled, startDate: "2026-07-10", endDate: "2026-07-10" }).success,
    ).toBe(true);
  });

  it("rejects bad links, long content, oversize dimensions", () => {
    expect(msgs({ ...filled, linkUrl: "//x.com" })).toContain(
      "admin.marketing.ads.validation.linkInvalid",
    );
    expect(msgs({ ...filled, content: "a".repeat(501) })).toContain(
      "admin.marketing.ads.validation.contentMax",
    );
    expect(msgs({ ...filled, width: 4001 })).toContain(
      "admin.marketing.ads.validation.sizeMax",
    );
    expect(schema.safeParse({ ...filled, width: 4000, height: 4000 }).success).toBe(true);
  });
});
