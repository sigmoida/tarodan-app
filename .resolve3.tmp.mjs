import { resolve } from "./.resolve.tmp.mjs";
resolve("packages/types/src/timing-rules.ts", [(ours) => ours, (ours) => ours]);
resolve("apps/api/src/common/timing-rules/timing-rules.registry.spec.ts", [
  ``,
  `  // Bayrağı çevrilmiş (davranışı yazılmış) ikinci eylemler: ikisi de seçilebilir.
  // extend_once davranışını ilgili zamanlayıcı okur (offer-scheduler,
  // trade-reconciliation, payment-expiry-reconciliation).
  const ENABLED_ACTIONS = {
    listingTtlDays: ["deactivate", "auto_renew"],
    offerExpiryHours: ["expire", "extend_once"],
    tradeResponseHours: ["cancel", "extend_once"],
    tradePaymentHours: ["cancel", "extend_once"],
    preparingDeadlineDays: ["cancel_and_refund", "extend_once"],
`,
  (ours) => ours,
  `@@UNAVAILABLE_EXAMPLE@@
`,
]);
resolve("apps/api/src/modules/timing-rules/timing-rules.service.spec.ts", [`@@UNAVAILABLE_LIST@@
`]);
