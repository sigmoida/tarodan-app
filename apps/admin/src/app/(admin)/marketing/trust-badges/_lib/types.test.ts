import { describe, expect, it } from "vitest";
import { TRUST_BADGE_ICONS, TRUST_BADGE_LIMITS } from "@tarodan/types";
import {
  emptyTrustBadgeForm,
  trustBadgeFormToPayload,
  trustBadgeSchema,
  trustBadgeToForm,
  type TrustBadge,
  type TrustBadgeFormValues,
} from "./types";

const t = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as never;

const valid: TrustBadgeFormValues = {
  ...emptyTrustBadgeForm,
  titleTr: "Güvenli",
};

const issues = (v: Partial<TrustBadgeFormValues>) => {
  const r = trustBadgeSchema(t).safeParse({ ...valid, ...v });
  return r.success
    ? []
    : r.error.issues.map((i) => [String(i.path[0]), i.message]);
};

describe("trustBadgeSchema", () => {
  it("accepts a TR title with a known icon", () => {
    expect(issues({})).toEqual([]);
  });

  it("requires the TR title, EN is optional", () => {
    expect(issues({ titleTr: "" })).toEqual([
      ["titleTr", "admin.marketing.trustBadges.validation.trRequired"],
    ]);
    expect(issues({ titleEn: "" })).toEqual([]);
  });

  it("rejects an unknown icon", () => {
    expect(issues({ icon: "nope" }).map(([f]) => f)).toEqual(["icon"]);
    expect(issues({ icon: TRUST_BADGE_ICONS[0] })).toEqual([]);
  });

  it("rejects EN description without TR", () => {
    expect(issues({ descriptionEn: "Desc" })).toEqual([
      [
        "descriptionTr",
        "admin.marketing.trustBadges.validation.trRequiredForEn",
      ],
    ]);
  });

  it("enforces the shared limits", () => {
    expect(
      issues({ titleTr: "x".repeat(TRUST_BADGE_LIMITS.title + 1) }).map(
        ([f]) => f,
      ),
    ).toEqual(["titleTr"]);
    expect(
      issues({
        descriptionEn: "x".repeat(TRUST_BADGE_LIMITS.description + 1),
        descriptionTr: "ok",
      }).map(([f]) => f),
    ).toEqual(["descriptionEn"]);
  });
});

describe("trustBadgeFormToPayload", () => {
  it("create omits an empty description", () => {
    expect(
      trustBadgeFormToPayload(valid, "create").description,
    ).toBeUndefined();
  });

  it("update clears an emptied description with null", () => {
    const p = trustBadgeFormToPayload(valid, "update");
    expect(p.description).toBeNull();
    expect(p.title).toEqual({ tr: "Güvenli", en: null });
  });

  it("round-trips a stored badge", () => {
    const badge = {
      id: "1",
      icon: TRUST_BADGE_ICONS[0],
      title: { tr: "Güvenli", en: "Secure" },
      description: { tr: "Açıklama", en: null },
      isActive: false,
      hideOnIos: true,
    } as unknown as TrustBadge;
    const form = trustBadgeToForm(badge);
    expect(trustBadgeFormToPayload(form, "update")).toEqual({
      icon: TRUST_BADGE_ICONS[0],
      title: { tr: "Güvenli", en: "Secure" },
      description: { tr: "Açıklama", en: null },
      isActive: false,
      hideOnIos: true,
    });
  });

  it("native gizleme bayrağı kapalı başlar ve payload'a taşınır", () => {
    expect(emptyTrustBadgeForm.hideOnIos).toBe(false);
    expect(trustBadgeFormToPayload(valid, "create").hideOnIos).toBe(false);
    expect(
      trustBadgeFormToPayload({ ...valid, hideOnIos: true }, "update")
        .hideOnIos,
    ).toBe(true);
  });
});
