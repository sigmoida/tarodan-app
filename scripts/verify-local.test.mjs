import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  CI_GROUPS,
  parseArguments,
  relatedApiTestFiles,
} from "./verify-local.mjs";
import { REPO_ROOT } from "./detect-affected-apps.mjs";

test("ci without --group runs the full gate, in order", () => {
  assert.deepEqual(parseArguments(["ci"]).groups, CI_GROUPS);
  assert.deepEqual(CI_GROUPS, ["static", "unit", "release"]);
});

test("ci --group selects exactly the named groups", () => {
  assert.deepEqual(
    parseArguments(["ci", "--group", "static", "--group", "unit"]).groups,
    ["static", "unit"],
  );
  assert.deepEqual(parseArguments(["ci", "--group", "e2e"]).groups, ["e2e"]);
});

test("rejects unknown groups and flags outside their mode", () => {
  assert.throws(() => parseArguments(["ci", "--group", "nope"]), /group/);
  assert.throws(() => parseArguments(["push", "--group", "unit"]), /ci mode/);
  assert.throws(() => parseArguments(["ci", "--tests"]), /push mode/);
});

test("push mode is typecheck-only unless --tests is passed", () => {
  assert.equal(parseArguments(["push"]).tests, false);
  assert.equal(parseArguments(["push", "--tests"]).tests, true);
  assert.deepEqual(parseArguments(["push"]).groups, []);
});

test("relates only existing API TypeScript files to jest", () => {
  const existing = new Set([
    join(REPO_ROOT, "apps/api/src/a.service.ts"),
    join(REPO_ROOT, "apps/api/test/e2e/x.e2e-spec.ts"),
  ]);
  assert.deepEqual(
    relatedApiTestFiles(
      [
        "apps/api/src/a.service.ts",
        "apps/api/src/deleted.ts",
        "apps/api/test/e2e/x.e2e-spec.ts",
        "apps/api/prisma/schema.prisma",
        "apps/web/src/page.tsx",
        "packages/shared/src/index.ts",
      ],
      (file) => existing.has(file),
    ),
    [...existing],
  );
});
