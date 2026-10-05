import { resolve } from "./.resolve.tmp.mjs";
resolve("apps/admin/src/app/(admin)/system/timing-rules/_components/TimingRuleRow.tsx", [
  `  inProgressWarningKey,
  helperParams,
`,
]);
resolve("apps/admin/src/app/(admin)/system/timing-rules/_lib/timing-rules.ts", [
  (ours, theirs) => `${ours}}

/**
${theirs}`,
]);
