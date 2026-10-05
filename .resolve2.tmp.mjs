import { resolve } from "./.resolve.tmp.mjs";
resolve("apps/api/src/common/timing-rules/timing-rules.registry.spec.ts", [
  ``,
  `  // Bayrağı çevrilmiş (davranışı yazılmış) ikinci eylemler: ikisi de seçilebilir.
  // extend_once davranışını ilgili zamanlayıcı okur (offer-scheduler,
  // trade-reconciliation).
  const ENABLED_ACTIONS = {
    listingTtlDays: ["deactivate", "auto_renew"],
    offerExpiryHours: ["expire", "extend_once"],
    tradeResponseHours: ["cancel", "extend_once"],
    tradePaymentHours: ["cancel", "extend_once"],
  } satisfies Partial<
    Record<TimingRuleId, [TimingExpiryAction, TimingExpiryAction]>
  >;

  it.each(Object.entries(ENABLED_ACTIONS))(
    "%s — ikinci eylemi açık ve seçilebilir, varsayılan eylem değişmedi",
    (id, [current, enabled]) => {
      expect(TIMING_RULES[id as TimingRuleId].actions).toEqual([
        { action: current, available: true },
        { action: enabled, available: true },
      ]);
      expect(isSelectableTimingAction(id as TimingRuleId, enabled)).toBe(true);
      expect(TIMING_RULES[id as TimingRuleId].defaultAction).toBe(current);
`,
  `      [...Object.keys(LATER_ACTIONS), ...Object.keys(ENABLED_ACTIONS)].sort(),
`,
]);
resolve("apps/api/src/common/timing-rules/timing-rules.resolver.spec.ts", [
  `    expect(pickTimingAction("preparingDeadlineDays", "extend_once")).toBe(
      "cancel_and_refund",
    );
  });

  it("açılmış ikinci eylemler (ilan, teklif, takas paketleri) seçilebilir", () => {
    expect(pickTimingAction("listingTtlDays", "auto_renew")).toBe("auto_renew");
    expect(pickTimingAction("offerExpiryHours", "extend_once")).toBe(
      "extend_once",
    );
    expect(pickTimingAction("tradeResponseHours", "extend_once")).toBe(
      "extend_once",
    );
    expect(pickTimingAction("tradePaymentHours", "extend_once")).toBe(
      "extend_once",
    );
`,
]);
resolve("apps/api/src/modules/timing-rules/timing-rules.service.spec.ts", [``]);
