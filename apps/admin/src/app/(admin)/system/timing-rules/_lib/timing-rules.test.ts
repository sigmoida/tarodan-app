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
  inProgressWarningKey,
  isActionLocked,
  isTimingGroup,
  readTimingRuleStates,
  rulesInTab,
  tabsWithErrors,
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
  outOfBounds: false,
  action: TIMING_RULES[id].defaultAction,
  updatedAt: null,
}));

const valuesWith = (patch: Record<string, string>) => ({
  ...toFormValues(STATES),
  ...patch,
});

const issuesFor = (
  values: Record<string, string>,
  states: AdminTimingRuleState[] = STATES,
) => {
  const result = timingRulesSchema(t, states).safeParse(values);
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
    expect(issuesFor(valuesWith({ paymentFailTimeoutMinutes: "30" }))).toEqual({
      paymentFailTimeoutMinutes: 'server.admin.timingRules.belowMin:{"min":31}',
    });
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

  it("validates only the rows that changed — an out-of-bounds effective value does not lock the form", () => {
    // Env'den gelen RETURN_WINDOW_DAYS=7 (min 14) ve eski ekrandan girilmiş
    // 500 saatlik takas yanıtı: ikisi de dokunulmadıkça başka bir satırı
    // kaydetmeye engel değil — satırda uyarı olarak görünürler.
    const states = STATES.map((state) =>
      state.id === "returnWindowDays"
        ? { ...state, value: 7, source: "env" as const, outOfBounds: true }
        : state.id === "tradeResponseHours"
          ? { ...state, value: 500, outOfBounds: true }
          : state,
    );
    const values = { ...toFormValues(states), offerExpiryHours: "48" };
    expect(issuesFor(values, states)).toEqual({});
    // Sınır dışı satır düzeltilmeye çalışılırsa sınırlar uygulanır.
    expect(
      issuesFor({ ...toFormValues(states), returnWindowDays: "10" }, states),
    ).toEqual({
      returnWindowDays: 'server.admin.timingRules.belowMin:{"min":14}',
    });
  });

  it("refuses an action that is not available yet", () => {
    expect(
      issuesFor(
        valuesWith({ [actionField("offerExpiryHours")]: "extend_once" }),
      ),
    ).toEqual({
      offerExpiryHoursAction: "server.admin.timingRules.actionUnavailable",
    });
  });

  it("accepts the listing auto-renew action now that it is available", () => {
    expect(
      issuesFor(valuesWith({ [actionField("listingTtlDays")]: "auto_renew" })),
    ).toEqual({});
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

  it("names the tabs that hold an error, including hidden ones", () => {
    expect(
      tabsWithErrors({
        payoutGraceDays: { message: "x" },
        listingTtlDaysAction: { message: "y" },
        unknownField: { message: "z" },
      }),
    ).toEqual(["listing", "payment"]);
    expect(tabsWithErrors({})).toEqual([]);
  });

  it("uses a listing-specific in-progress warning only for the listing lifetime", () => {
    expect(inProgressWarningKey("listingTtlDays")).toBe(
      "admin.timingRules.rules.listingTtlDays.inProgressWarning",
    );
    expect(inProgressWarningKey("returnWindowDays")).toBe(
      "admin.timingRules.appliesToInProgressWarning",
    );
  });

  it("locks the select for single-action rules", () => {
    expect(isActionLocked("tradeHoldDays")).toBe(true);
    expect(isActionLocked("listingTtlDays")).toBe(false);
  });

  it("shows enabled extend_once as selectable for offers and trades", () => {
    for (const id of [
      "offerExpiryHours",
      "tradeResponseHours",
      "tradePaymentHours",
    ] as const) {
      expect(actionOptions(t, id).map((option) => option.disabled)).toEqual([
        false,
        false,
      ]);
    }
  });

  it("shows later actions disabled with a coming-soon label", () => {
    expect(actionOptions(t, "listingTtlDays")).toEqual([
      {
        value: "deactivate",
        label: "admin.timingRules.actions.deactivate",
        disabled: false,
      },
      {
        value: "auto_renew",
        label:
          'admin.timingRules.comingSoon:{"action":"admin.timingRules.actions.auto_renew"}',
        disabled: true,
      },
    ]);
  });
});
