import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_ORDER,
  detectAffectedApps,
  loadWorkspaceGraph,
} from "./detect-affected-apps.mjs";

const graph = loadWorkspaceGraph();
const detect = (...files) => detectAffectedApps(files, { graph });

test("selects each application for its own files", () => {
  assert.deepEqual(detect("apps/api/src/main.ts"), ["api"]);
  assert.deepEqual(detect("apps/web/app/page.tsx"), ["web"]);
  assert.deepEqual(detect("apps/admin/app/page.tsx"), ["admin"]);
});

test("selects transitive consumers of shared packages", () => {
  assert.deepEqual(detect("packages/types/src/index.ts"), ["api", "web"]);
  assert.deepEqual(detect("packages/api-client/src/index.ts"), [
    "web",
    "admin",
  ]);
  assert.deepEqual(detect("packages/ui/src/button.tsx"), ["web", "admin"]);
  assert.deepEqual(detect("packages/brand/src/index.ts"), ["web", "admin"]);
  assert.deepEqual(detect("packages/logger/src/index.ts"), APP_ORDER);
});

test("selects all applications for root build manifests", () => {
  for (const filePath of [
    ".nvmrc",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "turbo.json",
  ]) {
    assert.deepEqual(detect(filePath), APP_ORDER);
  }
});

test("selects web for root brand assets", () => {
  assert.deepEqual(detect("photos/logolar/tarodan-logo.png"), ["web"]);
});

test("ignores mobile, documentation, workflow and unrelated files", () => {
  assert.deepEqual(
    detect(
      "apps/mobile/src/App.tsx",
      "packages/ui-native/src/index.ts",
      "docs/deployment.md",
      ".github/workflows/deploy-staging.yml",
      "README.md",
    ),
    [],
  );
});

test("keeps application order stable and removes duplicates", () => {
  assert.deepEqual(
    detect(
      "apps/admin/app/page.tsx",
      "apps/api/src/main.ts",
      "apps/web/app/page.tsx",
      "apps/api/src/orders/orders.service.ts",
    ),
    APP_ORDER,
  );
});

test("falls back to all applications for an unknown package path", () => {
  assert.deepEqual(detect("packages/new-package/src/index.ts"), APP_ORDER);
});
