import { Prisma } from "@prisma/client";
import {
  DEFAULT_INSTALLMENT_RULE,
  isInstallmentRuleLive,
  liveInstallmentRulesWhere,
  resolveInstallmentRule,
  type InstallmentRuleCandidate,
} from "./installment-rules";

const NOW = new Date("2026-11-10T12:00:00Z");
const HOUR = 60 * 60 * 1000;

let seq = 0;
function rule(
  overrides: Partial<InstallmentRuleCandidate> = {},
): InstallmentRuleCandidate {
  seq += 1;
  return {
    id: `rule-${String(seq).padStart(3, "0")}`,
    segment: "premium",
    minCount: 2,
    maxCount: 3,
    allowed: true,
    platformSharePct: new Prisma.Decimal(100),
    priority: 0,
    validFrom: new Date(NOW.getTime() - 24 * HOUR),
    validUntil: null,
    archivedAt: null,
    createdAt: new Date(NOW.getTime() - 24 * HOUR),
    ...overrides,
  };
}

describe("resolveInstallmentRule (plan 4.6.3)", () => {
  it("defaults to allowed with no platform share when nothing matches (D1: buyer pays all)", () => {
    expect(resolveInstallmentRule([], "free", 3, NOW)).toEqual(
      DEFAULT_INSTALLMENT_RULE,
    );
    expect(DEFAULT_INSTALLMENT_RULE.platformSharePct.toString()).toBe("0");
    expect(DEFAULT_INSTALLMENT_RULE.ruleId).toBeNull();
  });

  it("applies a segment rule only to its segment and its count range", () => {
    const premium = rule({ segment: "premium", minCount: 2, maxCount: 3 });
    const rules = [premium];
    expect(resolveInstallmentRule(rules, "premium", 3, NOW).ruleId).toBe(
      premium.id,
    );
    expect(
      resolveInstallmentRule(
        rules,
        "premium",
        3,
        NOW,
      ).platformSharePct.toString(),
    ).toBe("100");
    expect(resolveInstallmentRule(rules, "premium", 4, NOW)).toEqual(
      DEFAULT_INSTALLMENT_RULE,
    );
    expect(resolveInstallmentRule(rules, "free", 3, NOW)).toEqual(
      DEFAULT_INSTALLMENT_RULE,
    );
    expect(resolveInstallmentRule(rules, "guest", 2, NOW)).toEqual(
      DEFAULT_INSTALLMENT_RULE,
    );
  });

  it("applies an `all` rule to every segment, guests included", () => {
    const cap = rule({
      segment: "all",
      minCount: 7,
      maxCount: 12,
      allowed: false,
      platformSharePct: new Prisma.Decimal(0),
    });
    for (const segment of [
      "guest",
      "free",
      "basic",
      "premium",
      "business",
    ] as const) {
      expect(resolveInstallmentRule([cap], segment, 9, NOW)).toEqual({
        allowed: false,
        platformSharePct: new Prisma.Decimal(0),
        ruleId: cap.id,
      });
    }
  });

  it("lets a guest rule disallow counts for guests only", () => {
    const guest = rule({
      segment: "guest",
      minCount: 2,
      maxCount: 12,
      allowed: false,
      platformSharePct: new Prisma.Decimal(0),
    });
    expect(resolveInstallmentRule([guest], "guest", 6, NOW).allowed).toBe(
      false,
    );
    expect(resolveInstallmentRule([guest], "free", 6, NOW)).toEqual(
      DEFAULT_INSTALLMENT_RULE,
    );
  });

  it("picks the highest priority first, even over a specific segment", () => {
    const specific = rule({ segment: "premium", priority: 0 });
    const all = rule({
      segment: "all",
      priority: 5,
      platformSharePct: new Prisma.Decimal(50),
    });
    expect(
      resolveInstallmentRule([specific, all], "premium", 2, NOW).ruleId,
    ).toBe(all.id);
  });

  it("on equal priority prefers the specific segment over `all`", () => {
    const all = rule({
      segment: "all",
      createdAt: new Date(NOW.getTime() - HOUR),
    });
    const specific = rule({
      segment: "premium",
      createdAt: new Date(NOW.getTime() - 5 * HOUR),
    });
    expect(
      resolveInstallmentRule([all, specific], "premium", 2, NOW).ruleId,
    ).toBe(specific.id);
    expect(
      resolveInstallmentRule([specific, all], "premium", 2, NOW).ruleId,
    ).toBe(specific.id);
  });

  it("then prefers the newest, then the id, so the result never depends on input order", () => {
    const older = rule({ createdAt: new Date(NOW.getTime() - 5 * HOUR) });
    const newer = rule({
      createdAt: new Date(NOW.getTime() - HOUR),
      platformSharePct: new Prisma.Decimal(50),
    });
    expect(
      resolveInstallmentRule([older, newer], "premium", 2, NOW).ruleId,
    ).toBe(newer.id);
    expect(
      resolveInstallmentRule([newer, older], "premium", 2, NOW).ruleId,
    ).toBe(newer.id);
    const sameTime = new Date(NOW.getTime() - HOUR);
    const a = rule({ id: "rule-a", createdAt: sameTime });
    const b = rule({ id: "rule-b", createdAt: sameTime });
    expect(resolveInstallmentRule([a, b], "premium", 2, NOW).ruleId).toBe(
      "rule-b",
    );
    expect(resolveInstallmentRule([b, a], "premium", 2, NOW).ruleId).toBe(
      "rule-b",
    );
  });

  it("respects the validity window: validFrom inclusive, validUntil exclusive", () => {
    const window = rule({
      validFrom: NOW,
      validUntil: new Date(NOW.getTime() + HOUR),
    });
    expect(resolveInstallmentRule([window], "premium", 2, NOW).ruleId).toBe(
      window.id,
    );
    expect(
      resolveInstallmentRule(
        [window],
        "premium",
        2,
        new Date(NOW.getTime() - 1),
      ).ruleId,
    ).toBeNull();
    expect(
      resolveInstallmentRule(
        [window],
        "premium",
        2,
        new Date(NOW.getTime() + HOUR),
      ).ruleId,
    ).toBeNull();
    expect(
      resolveInstallmentRule(
        [window],
        "premium",
        2,
        new Date(NOW.getTime() + HOUR - 1),
      ).ruleId,
    ).toBe(window.id);
  });

  it("ignores archived versions and scheduled ones that have not started", () => {
    const archived = rule({ archivedAt: new Date(NOW.getTime() - HOUR) });
    const scheduled = rule({ validFrom: new Date(NOW.getTime() + HOUR) });
    expect(
      resolveInstallmentRule([archived, scheduled], "premium", 2, NOW),
    ).toEqual(DEFAULT_INSTALLMENT_RULE);
  });

  it("returns share 0 for a disallowing winner, even if a stray share is stored", () => {
    // The validator and the DB CHECK keep the share 0 when not allowed; the
    // resolver must not depend on that to report no platform share.
    const off = rule({
      allowed: false,
      platformSharePct: new Prisma.Decimal(50),
    });
    expect(resolveInstallmentRule([off], "premium", 2, NOW)).toEqual({
      allowed: false,
      platformSharePct: new Prisma.Decimal(0),
      ruleId: off.id,
    });
  });

  it("is per count: 'premium 2-3 at 100%, 4-6 at 50%' prices each count by its own rule", () => {
    const free = rule({
      minCount: 2,
      maxCount: 3,
      platformSharePct: new Prisma.Decimal(100),
    });
    const half = rule({
      minCount: 4,
      maxCount: 6,
      platformSharePct: new Prisma.Decimal(50),
    });
    const rules = [free, half];
    expect(resolveInstallmentRule(rules, "premium", 3, NOW).ruleId).toBe(
      free.id,
    );
    expect(resolveInstallmentRule(rules, "premium", 6, NOW).ruleId).toBe(
      half.id,
    );
    expect(resolveInstallmentRule(rules, "premium", 9, NOW).ruleId).toBeNull();
  });
});

describe("isInstallmentRuleLive / liveInstallmentRulesWhere", () => {
  it("agrees with the window the resolver uses", () => {
    expect(isInstallmentRuleLive(rule(), NOW)).toBe(true);
    expect(isInstallmentRuleLive(rule({ archivedAt: NOW }), NOW)).toBe(false);
    expect(isInstallmentRuleLive(rule({ validUntil: NOW }), NOW)).toBe(false);
  });

  it("queries unarchived versions of the segment or `all` valid at the time", () => {
    expect(liveInstallmentRulesWhere("guest", NOW)).toEqual({
      archivedAt: null,
      segment: { in: ["guest", "all"] },
      validFrom: { lte: NOW },
      OR: [{ validUntil: null }, { validUntil: { gt: NOW } }],
    });
  });
});
