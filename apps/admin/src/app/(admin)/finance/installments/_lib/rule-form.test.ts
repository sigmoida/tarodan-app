import { describe, expect, it } from "vitest";
import type { AdminInstallmentRule } from "@tarodan/types";
import { fakeT } from "@/test-utils/dom";
import type { Translate } from "@/lib/statusLabels";
import {
  draftOfRuleForm,
  emptyRuleForm,
  parseRuleForm,
  ruleFieldOfErrorKey,
  ruleFormSchema,
  ruleToForm,
  type InstallmentRuleFormValues,
} from "./rule-form";

const t = fakeT as unknown as Translate;

const valid = (
  over: Partial<InstallmentRuleFormValues> = {},
): InstallmentRuleFormValues => ({
  name: "Premium 3 taksit",
  segment: "premium",
  minCount: "2",
  maxCount: "3",
  allowed: true,
  platformSharePct: "100",
  priority: "0",
  validFrom: "2026-11-15T00:00",
  validUntil: "",
  ...over,
});

const rule = (
  over: Partial<AdminInstallmentRule> = {},
): AdminInstallmentRule => ({
  id: "rule-2",
  lineageId: "rule-1",
  version: 2,
  name: "Premium half",
  segment: "premium",
  minCount: 4,
  maxCount: 6,
  allowed: true,
  platformSharePct: 33.5,
  priority: 5,
  validFrom: "2026-11-14T21:00:00.000Z",
  validUntil: "2026-12-31T21:00:00.000Z",
  createdBy: "admin-1",
  createdAt: "2026-11-01T10:00:00.000Z",
  archivedAt: null,
  archivedBy: null,
  status: "active",
  ...over,
});

/** The field -> message pairs the schema reports. */
function errorsOf(values: InstallmentRuleFormValues) {
  const result = ruleFormSchema(t).safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

describe("parseRuleForm", () => {
  it("reads the typed text into the API input with Istanbul times", () => {
    expect(
      parseRuleForm(
        valid({
          name: "  Premium  ",
          platformSharePct: "12,5",
          priority: "-3",
          validUntil: "2026-12-01T09:30",
        }),
      ),
    ).toEqual({
      name: "Premium",
      segment: "premium",
      minCount: 2,
      maxCount: 3,
      allowed: true,
      platformSharePct: 12.5,
      priority: -3,
      validFrom: "2026-11-15T00:00:00.000+03:00",
      validUntil: "2026-12-01T09:30:00.000+03:00",
    });
  });

  it("sends an empty end as open-ended and no share for counts that are off", () => {
    const input = parseRuleForm(
      valid({ allowed: false, platformSharePct: "40" }),
    );
    expect(input.validUntil).toBeNull();
    expect(input.platformSharePct).toBe(0);
  });

  it("turns text that is not a number into NaN for the validator", () => {
    const input = parseRuleForm(
      valid({ platformSharePct: "1.000,5", priority: "1.5" }),
    );
    expect(input.platformSharePct).toBeNaN();
    expect(input.priority).toBeNaN();
  });
});

describe("ruleFormSchema (the shared validateInstallmentRule)", () => {
  it("accepts a valid rule", () => {
    expect(errorsOf(valid())).toEqual({});
  });

  it("puts each violation on its field with the API's catalog key", () => {
    expect(
      errorsOf(
        valid({
          name: " ",
          minCount: "5",
          maxCount: "3",
          platformSharePct: "120",
          priority: "5000",
          validFrom: "",
        }),
      ),
    ).toEqual({
      name: "server.admin.installments.rule.nameRequired",
      minCount: "server.admin.installments.rule.countRange",
      platformSharePct: "server.admin.installments.rule.shareRange",
      priority: "server.admin.installments.rule.priorityRange",
      validFrom: "server.admin.installments.rule.validFromInvalid",
    });
  });

  it("refuses more than two share decimals and an end not after the start", () => {
    expect(
      errorsOf(
        valid({
          platformSharePct: "12,345",
          validUntil: "2026-11-15T00:00",
        }),
      ),
    ).toEqual({
      platformSharePct: "server.admin.installments.rule.sharePrecision",
      validUntil: "server.admin.installments.rule.validUntilNotAfterFrom",
    });
  });

  it("does not ask for a share when the counts are not offered", () => {
    expect(errorsOf(valid({ allowed: false, platformSharePct: "" }))).toEqual(
      {},
    );
  });
});

describe("draftOfRuleForm", () => {
  it("is the priced part of a rule whose priced fields are valid", () => {
    // A missing name or start does not stop the preview.
    expect(draftOfRuleForm(valid({ name: "", validFrom: "" }))).toEqual({
      segment: "premium",
      minCount: 2,
      maxCount: 3,
      allowed: true,
      platformSharePct: 100,
      priority: 0,
    });
  });

  it("is null while a priced field is invalid", () => {
    expect(draftOfRuleForm(valid({ platformSharePct: "abc" }))).toBeNull();
    expect(draftOfRuleForm(valid({ minCount: "9", maxCount: "4" }))).toBeNull();
  });
});

describe("form seeds", () => {
  it("starts a new rule as everyone, 2-3, offered, share 0, from now", () => {
    expect(emptyRuleForm(new Date("2026-11-06T09:41:30.000Z"))).toEqual({
      name: "",
      segment: "all",
      minCount: "2",
      maxCount: "3",
      allowed: true,
      platformSharePct: "0",
      priority: "0",
      validFrom: "2026-11-06T12:41",
      validUntil: "",
    });
  });

  it("starts a new version from the version it replaces, round-tripping", () => {
    const form = ruleToForm(rule());
    expect(form).toEqual({
      name: "Premium half",
      segment: "premium",
      minCount: "4",
      maxCount: "6",
      allowed: true,
      platformSharePct: "33,5",
      priority: "5",
      validFrom: "2026-11-15T00:00",
      validUntil: "2027-01-01T00:00",
    });
    const input = parseRuleForm(form);
    expect(new Date(input.validFrom).toISOString()).toBe(rule().validFrom);
    expect(new Date(input.validUntil!).toISOString()).toBe(rule().validUntil);
    expect(input.platformSharePct).toBe(33.5);
  });
});

describe("ruleFieldOfErrorKey", () => {
  it("maps the API's rule violation keys to their form field", () => {
    expect(
      ruleFieldOfErrorKey("server.admin.installments.rule.countRange"),
    ).toBe("minCount");
    expect(
      ruleFieldOfErrorKey("server.admin.installments.rule.shareWithoutAllowed"),
    ).toBe("platformSharePct");
    expect(
      ruleFieldOfErrorKey("server.admin.installments.rule.validUntilInvalid"),
    ).toBe("validUntil");
  });

  it("is null for keys that name no field", () => {
    expect(
      ruleFieldOfErrorKey("server.admin.installments.rule.notCurrent"),
    ).toBe(null);
    expect(ruleFieldOfErrorKey("server.common.error")).toBe(null);
    expect(ruleFieldOfErrorKey(null)).toBe(null);
  });
});
