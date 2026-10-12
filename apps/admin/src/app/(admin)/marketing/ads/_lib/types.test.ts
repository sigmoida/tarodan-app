import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  AD_POSITIONS,
  adFormToPayload,
  adSchema,
  adToForm,
  emptyAdForm,
  hotspotIssues,
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

describe("hotspots in the payload", () => {
  const spot = (over = {}) => ({
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    label: " Sepet ",
    linkUrl: " /sepet ",
    ...over,
  });
  const imageForm = {
    ...filled,
    linkUrl: "/stale",
    hotspots: [spot({ id: "h1", clickCount: 7 }), spot({ x: 0.5 })],
  };

  it("update: sends the full set, id only for persisted rows, trimmed, no clickCount", () => {
    const p = adFormToPayload(imageForm, "update");
    expect(p.hotspots).toEqual([
      { id: "h1", x: 0.1, y: 0.1, width: 0.2, height: 0.2, label: "Sepet", linkUrl: "/sepet" },
      { x: 0.5, y: 0.1, width: 0.2, height: 0.2, label: "Sepet", linkUrl: "/sepet" },
    ]);
  });

  it("image ad: ad-level link is null on update and omitted on create", () => {
    expect(adFormToPayload(imageForm, "update").linkUrl).toBeNull();
    expect(adFormToPayload(imageForm, "create").linkUrl).toBeUndefined();
  });

  it("update always sends the array (empty clears), create only when non-empty", () => {
    const none = { ...filled, hotspots: [] };
    expect(adFormToPayload(none, "update").hotspots).toEqual([]);
    expect("hotspots" in adFormToPayload(none, "create")).toBe(false);
    expect(adFormToPayload(imageForm, "create").hotspots).toHaveLength(2);
  });

  it("text-only ad keeps its ad-level link", () => {
    const text = { ...emptyAdForm, title: "x", linkUrl: "/kampanya" };
    expect(adFormToPayload(text, "update").linkUrl).toBe("/kampanya");
    expect(adFormToPayload(text, "create").linkUrl).toBe("/kampanya");
  });

  it("adToForm sorts by sortOrder and carries id + clickCount", () => {
    const row = (id: string, sortOrder: number) => ({
      id,
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
      label: id,
      linkUrl: "/a",
      sortOrder,
      clickCount: sortOrder * 10,
    });
    const ad = {
      title: "a",
      position: "topbar",
      isActive: true,
      hotspots: [row("b", 1), row("a", 0)],
    } as Ad;
    expect(adToForm(ad).hotspots.map((h) => [h.id, h.clickCount])).toEqual([
      ["a", 0],
      ["b", 10],
    ]);
    expect(adToForm({ ...ad, hotspots: undefined }).hotspots).toEqual([]);
  });
});

describe("hotspotIssues / adSchema hotspot rules", () => {
  const ok = { x: 0.1, y: 0.1, width: 0.2, height: 0.2, label: "A", linkUrl: "/a" };
  const paths = (list: Parameters<typeof hotspotIssues>[1]) =>
    hotspotIssues(t, list).map((i) => i.path.join("."));

  it("accepts an empty list and valid rows", () => {
    expect(hotspotIssues(t, [])).toEqual([]);
    expect(hotspotIssues(t, [ok, { ...ok, x: 0.5 }])).toEqual([]);
  });

  it("maps each shared error code to its row field and message key", () => {
    expect(hotspotIssues(t, [{ ...ok, label: " " }])).toEqual([
      { path: ["hotspots", 0, "label"], message: "admin.marketing.ads.hotspots.error.labelRequired" },
    ]);
    expect(paths([{ ...ok, label: "x".repeat(81) }])).toEqual(["hotspots.0.label"]);
    expect(paths([{ ...ok, linkUrl: "" }])).toEqual(["hotspots.0.linkUrl"]);
    expect(paths([{ ...ok, width: 0.01 }])).toEqual(["hotspots.0.x"]);
    expect(paths([{ ...ok, x: 0.95 }])).toEqual(["hotspots.0.x"]);
    expect(paths([ok, { ...ok, x: 0.2 }])).toEqual(["hotspots.1.x"]);
  });

  it("flags too many rows on the list itself", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      ...ok,
      x: (i % 5) * 0.2,
      y: Math.floor(i / 5) * 0.3,
    }));
    expect(hotspotIssues(t, many)[0]).toEqual({
      path: ["hotspots"],
      message: "admin.marketing.ads.hotspots.error.tooMany",
    });
  });

  it("rejects a malformed row link with the link message", () => {
    expect(hotspotIssues(t, [{ ...ok, linkUrl: "//evil.com" }])).toEqual([
      { path: ["hotspots", 0, "linkUrl"], message: "admin.marketing.ads.validation.linkInvalid" },
    ]);
  });

  it("surfaces the issues through the form schema", () => {
    const r = adSchema(t).safeParse({
      ...filled,
      hotspots: [{ ...ok, label: "" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join("."))).toContain("hotspots.0.label");
    }
    expect(adSchema(t).safeParse({ ...filled, hotspots: [ok] }).success).toBe(true);
  });
});
