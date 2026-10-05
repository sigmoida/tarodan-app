import { resolve } from "./.resolve.tmp.mjs";
resolve("packages/types/src/timing-rules.ts", [
  `/** Bugünkü davranış + davranışı yazılmış (açık) ikinci seçenek. */
const withEnabled = (
  action: TimingExpiryAction,
  enabled: TimingExpiryAction,
): Pick<TimingRuleDefinition, "actions" | "defaultAction"> => ({
  actions: [
    { action, available: true },
    { action: enabled, available: true },
  ],
  defaultAction: action,
});

/** Bugünkü davranış + AÇIK extend_once (yalnız süreyi bir kez uzatır). */
const withExtendOnce = (
  action: TimingExpiryAction,
): Pick<TimingRuleDefinition, "actions" | "defaultAction"> =>
  withEnabled(action, "extend_once");
`,
]);
