import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MAX_CACHED_TREES,
  appsToVerify,
  passedApps,
  readPushCache,
  recordVerifiedApps,
  verifiedAppsForTree,
  writePushCache,
} from "./push-verification-cache.mjs";

test("skips only the apps already verified for the same tree", () => {
  const cache = { "tree-1": { apps: ["api", "web"], verifiedAt: "t" } };
  assert.deepEqual(
    appsToVerify(["api", "web", "admin"], verifiedAppsForTree(cache, "tree-1")),
    ["admin"],
  );
  assert.deepEqual(
    appsToVerify(["api"], verifiedAppsForTree(cache, "tree-2")),
    ["api"],
  );
});

test("an app counts as passed only when every one of its stages passed", () => {
  const stages = [
    { app: "api", status: "PASS" },
    { app: "api", status: "PASS" },
    { app: "web", status: "PASS" },
    { app: "web", status: "FAIL" },
    { app: "admin", status: "NOT RUN" },
  ];
  assert.deepEqual(passedApps(["api", "web", "admin"], stages), ["api"]);
  assert.deepEqual(passedApps(["api"], []), []);
});

test("records apps per tree, merging with earlier results", () => {
  let cache = recordVerifiedApps({}, "tree-1", ["api"], "2026-10-16T10:00:00Z");
  cache = recordVerifiedApps(cache, "tree-1", ["web"], "2026-10-16T11:00:00Z");
  assert.deepEqual(cache["tree-1"].apps, ["api", "web"]);
  assert.equal(recordVerifiedApps(cache, "tree-2", [], "x"), cache);
});

test("keeps only the newest trees", () => {
  let cache = {};
  for (let index = 0; index < MAX_CACHED_TREES + 5; index += 1) {
    const at = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
    cache = recordVerifiedApps(cache, `tree-${index}`, ["api"], at);
  }
  assert.equal(Object.keys(cache).length, MAX_CACHED_TREES);
  assert.ok(!cache["tree-0"]);
  assert.ok(cache[`tree-${MAX_CACHED_TREES + 4}`]);
});

test("a missing or corrupt cache file reads as empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "push-cache-"));
  const path = join(dir, "cache.json");
  assert.deepEqual(readPushCache(path), {});
  writeFileSync(path, "{not json");
  assert.deepEqual(readPushCache(path), {});
  writePushCache(path, { "tree-1": { apps: ["api"], verifiedAt: "t" } });
  assert.deepEqual(readPushCache(path)["tree-1"].apps, ["api"]);
});
