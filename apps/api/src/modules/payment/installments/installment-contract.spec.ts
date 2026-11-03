import {
  INSTALLMENT_SEGMENTS,
  INSTALLMENT_SETTINGS,
  installmentRuleStatusOf,
  installmentRulesOverlap,
  installmentRuleViolationKey,
  isInstallmentSettingKey,
  parseInstallmentMinAmount,
  parseInstallmentsEnabled,
  validateInstallmentMinAmount,
  validateInstallmentRule,
  type InstallmentRuleInput,
  type InstallmentRuleOverlapSubject,
} from "@tarodan/types";
import { $Enums } from "@prisma/client";

/**
 * The shared installment contract in `@tarodan/types` (the admin form and the
 * API run the same functions). Pinned here because the API is its runtime
 * consumer.
 */
const VALID: InstallmentRuleInput = {
  name: "Premium 3 taksit vade farksız",
  segment: "premium",
  minCount: 2,
  maxCount: 3,
  allowed: true,
  platformSharePct: 100,
  priority: 0,
  validFrom: "2026-11-01T00:00:00.000Z",
  validUntil: null,
};

describe("installment segments and settings", () => {
  it("mirror the Prisma enum exactly", () => {
    expect([...INSTALLMENT_SEGMENTS].sort()).toEqual(
      Object.values($Enums.InstallmentSegment).sort(),
    );
  });

  it("define the two keys with D3's defaults and no max-count setting (D2)", () => {
    expect(INSTALLMENT_SETTINGS.enabled).toEqual({
      key: "installments_enabled",
      default: false,
    });
    expect(INSTALLMENT_SETTINGS.minAmount).toMatchObject({
      key: "installment_min_amount",
      default: 500,
      min: 0,
      max: 1_000_000,
      decimals: 2,
    });
    expect(Object.keys(INSTALLMENT_SETTINGS)).toEqual(["enabled", "minAmount"]);
    expect(isInstallmentSettingKey("installments_enabled")).toBe(true);
    expect(isInstallmentSettingKey("installment_min_amount")).toBe(true);
    expect(isInstallmentSettingKey("installment_max_count")).toBe(false);
  });

  it("read a missing row as off and 500", () => {
    expect(parseInstallmentsEnabled(undefined)).toBe(false);
    expect(parseInstallmentsEnabled(null)).toBe(false);
    expect(parseInstallmentMinAmount(undefined)).toBe(500);
    expect(parseInstallmentMinAmount("250.50")).toBe(250.5);
    expect(parseInstallmentMinAmount("1e3")).toBe(500);
  });

  it("validate the minimum amount", () => {
    expect(validateInstallmentMinAmount(0)).toBeNull();
    expect(validateInstallmentMinAmount(1_000_000)).toBeNull();
    expect(validateInstallmentMinAmount(499.99)).toBeNull();
    expect(validateInstallmentMinAmount(-0.01)).toEqual({
      code: "outOfRange",
      min: 0,
      max: 1_000_000,
    });
    expect(validateInstallmentMinAmount(0.001)).toEqual({
      code: "tooManyDecimals",
      decimals: 2,
    });
    expect(validateInstallmentMinAmount(Number.POSITIVE_INFINITY)).toEqual({
      code: "notANumber",
    });
  });
});

describe("validateInstallmentRule", () => {
  it("accepts a valid rule, open-ended or with an end", () => {
    expect(validateInstallmentRule(VALID)).toEqual([]);
    expect(
      validateInstallmentRule({
        ...VALID,
        validUntil: "2026-12-01T00:00:00.000Z",
      }),
    ).toEqual([]);
    expect(
      validateInstallmentRule({
        ...VALID,
        segment: "all",
        minCount: 7,
        maxCount: 12,
        allowed: false,
        platformSharePct: 0,
      }),
    ).toEqual([]);
    expect(
      validateInstallmentRule({ ...VALID, platformSharePct: 33.33 }),
    ).toEqual([]);
  });

  it("reports every violation with its field, for the admin form", () => {
    expect(
      validateInstallmentRule({
        ...VALID,
        name: "",
        segment: "vip" as never,
        minCount: 4,
        maxCount: 3,
        platformSharePct: -1,
        priority: 0.5,
        validFrom: "yesterday",
      }).map((v) => [v.code, v.field]),
    ).toEqual([
      ["nameRequired", "name"],
      ["segmentInvalid", "segment"],
      ["countRange", "minCount"],
      ["shareRange", "platformSharePct"],
      ["priorityRange", "priority"],
      ["validFromInvalid", "validFrom"],
    ]);
  });

  it.each`
    patch                                         | code
    ${{ name: "x".repeat(121) }}                  | ${"nameTooLong"}
    ${{ minCount: 2, maxCount: 13 }}              | ${"countRange"}
    ${{ minCount: 2.5 }}                          | ${"countRange"}
    ${{ platformSharePct: 100.01 }}               | ${"shareRange"}
    ${{ platformSharePct: 10.125 }}               | ${"sharePrecision"}
    ${{ allowed: false, platformSharePct: 0.01 }} | ${"shareWithoutAllowed"}
    ${{ priority: -1001 }}                        | ${"priorityRange"}
    ${{ validUntil: "never" }}                    | ${"validUntilInvalid"}
    ${{ validUntil: "2026-11-01T00:00:00.000Z" }} | ${"validUntilNotAfterFrom"}
  `("refuses $code", ({ patch, code }) => {
    const [first] = validateInstallmentRule({ ...VALID, ...patch });
    expect(first.code).toBe(code);
    expect(installmentRuleViolationKey(first)).toBe(
      `server.admin.installments.rule.${code}`,
    );
  });
});

describe("installmentRuleStatusOf", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  it.each`
    rule                                                                         | status
    ${{ validFrom: "2026-11-01T00:00:00Z" }}                                     | ${"active"}
    ${{ validFrom: "2026-11-11T00:00:00Z" }}                                     | ${"scheduled"}
    ${{ validFrom: "2026-11-01T00:00:00Z", validUntil: "2026-11-10T00:00:00Z" }} | ${"expired"}
    ${{ validFrom: "2026-11-01T00:00:00Z", archivedAt: "2026-11-05T00:00:00Z" }} | ${"archived"}
    ${{ validFrom: "2026-11-11T00:00:00Z", archivedAt: "2026-11-05T00:00:00Z" }} | ${"archived"}
  `("is $status", ({ rule, status }) => {
    expect(installmentRuleStatusOf(rule, now)).toBe(status);
  });
});

describe("installmentRulesOverlap", () => {
  const base: InstallmentRuleOverlapSubject = {
    segment: "premium",
    priority: 0,
    minCount: 2,
    maxCount: 3,
    validFrom: "2026-11-01T00:00:00Z",
    validUntil: null,
  };
  it.each`
    case                                     | other                                                                                 | overlaps
    ${"the same segment, counts and window"} | ${base}                                                                               | ${true}
    ${"an `all` rule"}                       | ${{ ...base, segment: "all", minCount: 3, maxCount: 12 }}                             | ${true}
    ${"another segment"}                     | ${{ ...base, segment: "free" }}                                                       | ${false}
    ${"another priority"}                    | ${{ ...base, priority: 1 }}                                                           | ${false}
    ${"disjoint counts"}                     | ${{ ...base, minCount: 4, maxCount: 6 }}                                              | ${false}
    ${"a window that ended before"}          | ${{ ...base, validFrom: "2026-10-01T00:00:00Z", validUntil: "2026-11-01T00:00:00Z" }} | ${false}
    ${"an archived version"}                 | ${{ ...base, archivedAt: "2026-11-02T00:00:00Z" }}                                    | ${false}
  `("$case -> $overlaps", ({ other, overlaps }) => {
    expect(installmentRulesOverlap(base, other)).toBe(overlaps);
    expect(installmentRulesOverlap(other, base)).toBe(overlaps);
  });
});
