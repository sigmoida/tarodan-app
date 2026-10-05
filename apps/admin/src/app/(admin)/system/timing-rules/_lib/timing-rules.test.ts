import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  TIMING_GROUPS,
  TIMING_RULES,
  TIMING_RULE_IDS,
  type AdminTimingRuleState,
} from "@tarodan/types";
import {
  actionField,
  actionOptions,
  changedRules,
  isActionLocked,
  isTimingGroup,
  readTimingRuleStates,
  rulesInTab,
  timingRulesSchema,
  toFormValues,
  valueField,
} from "./timing-rules";

type T = ReturnType<typeof useTranslations<never>>;
/** Anahtarı (ve varsa parametreleri) geri döndüren sahte t. */
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as T;

const STATES: AdminTimingRuleState[] = TIMING_RULE_IDS.map((id) => ({
  id,
  value: TIMING_RULES[id].default,
  source: "default",
  action: TIMING_RULES[id].defaultAction,
  updatedAt: null,
}));

const valuesWith = (patch: Record<string, string>) => ({
  ...toFormValues(STATES),
  ...patch,
});

const issuesFor = (values: Record<string, string>) => {
  const result = timingRulesSchema(t, STATES).safeParse(values);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [issue.path[0], issue.message]),
      );
};

describe("timing rules form mapping", () => {
  it("reads the response with or without an envelope", () => {
    expect(readTimingRuleStates({ rules: STATES })).toBe(STATES);
    expect(readTimingRuleStates({ data: { rules: STATES } })).toBe(STATES);
    expect(readTimingRuleStates(undefined)).toEqual([]);
  });

  it("seeds a value and an action field per rule", () => {
    const values = toFormValues(STATES);
    expect(values[valueField("returnWindowDays")]).toBe("14");
    expect(values[actionField("listingTtlDays")]).toBe("deactivate");
  });

  it("sends only the rules that actually changed", () => {
    expect(changedRules(toFormValues(STATES), STATES)).toEqual([]);
    expect(
      changedRules(
        valuesWith({ returnWindowDays: "21", offerExpiryHours: "24" }),
        STATES,
      ),
    ).toEqual([{ id: "returnWindowDays", value: 21 }]);
  });
});

describe("timing rules schema — same rules as the server", () => {
  it("accepts the current values", () => {
    expect(issuesFor(toFormValues(STATES))).toEqual({});
  });

  it("rejects empty, fractional, zero and out-of-range values", () => {
    expect(issuesFor(valuesWith({ tradeShippingDays: "" }))).toEqual({
      tradeShippingDays: "admin.timingRules.validation.required",
    });
    expect(issuesFor(valuesWith({ tradeShippingDays: "2.5" }))).toEqual({
      tradeShippingDays: "server.admin.timingRules.notInteger",
    });
    expect(issuesFor(valuesWith({ payoutGraceDays: "0" }))).toEqual({
      payoutGraceDays: 'server.admin.timingRules.belowMin:{"min":1}',
    });
    expect(issuesFor(valuesWith({ returnWindowDays: "13" }))).toEqual({
      returnWindowDays: 'server.admin.timingRules.belowMin:{"min":14}',
    });
    expect(issuesFor(valuesWith({ paymentFailTimeoutMinutes: "30" }))).toEqual(
      {
        paymentFailTimeoutMinutes:
          'server.admin.timingRules.belowMin:{"min":31}',
      },
    );
  });

  it("checks cross-field rules on the edited values", () => {
    expect(issuesFor(valuesWith({ returnDropoffHardDays: "10" }))).toEqual({
      returnDropoffHardDays:
        "server.admin.timingRules.invariant.dropoffHardNotBelowDropoff",
    });
    expect(
      issuesFor(
        valuesWith({ returnDropoffDays: "30", returnDropoffHardDays: "40" }),
      ),
    ).toEqual({});
  });

  it("refuses an action that is not available yet", () => {
    expect(
      issuesFor(valuesWith({ [actionField("listingTtlDays")]: "auto_renew" })),
    ).toEqual({
      listingTtlDaysAction: "server.admin.timingRules.actionUnavailable",
    });
  });
});

describe("timing rules screen helpers", () => {
  it("covers every rule exactly once across the tabs", () => {
    expect(TIMING_GROUPS.flatMap((group) => rulesInTab(group)).sort()).toEqual(
      [...TIMING_RULE_IDS].sort(),
    );
    expect(isTimingGroup("trade")).toBe(true);
    expect(isTimingGroup("security")).toBe(false);
  });

  it("locks the select for single-action rules", () => {
    expect(isActionLocked("tradeHoldDays")).toBe(true);
    expect(isActionLocked("listingTtlDays")).toBe(false);
  });

  it("shows later actions disabled with a coming-soon label", () => {
    expect(actionOptions(t, "offerExpiryHours")).toEqual([
      {
        value: "expire",
        label: "admin.timingRules.actions.expire",
        disabled: false,
      },
      {
        value: "extend_once",
        label:
          'admin.timingRules.comingSoon:{"action":"admin.timingRules.actions.extend_once"}',
        disabled: true,
      },
    ]);
  });
});
