import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const runAuditCheck = (advisories) =>
  spawnSync(process.execPath, ["scripts/check-dependency-audit.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    input: JSON.stringify({ advisories }),
  });

test("ignores advisories found only in excluded mobile workspaces", () => {
  const result = runAuditCheck({
    1: {
      github_advisory_id: "GHSA-test-mobile-only",
      module_name: "mobile-only-package",
      severity: "high",
      findings: [
        {
          paths: [
            "apps__mobile>expo>mobile-only-package",
            "packages__ui-native>mobile-only-package",
          ],
        },
      ],
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 reviewed high advisory/);
});

test("retains an advisory when any finding reaches a deployed workspace", () => {
  const result = runAuditCheck({
    1: {
      github_advisory_id: "GHSA-test-deployed-app",
      module_name: "shared-package",
      severity: "high",
      findings: [
        { paths: ["apps__mobile>expo>shared-package"] },
        { paths: ["apps__admin>shared-package"] },
      ],
    },
  });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /GHSA-test-deployed-app \(shared-package\) is a new high-severity advisory/,
  );
});

test("fails closed when an advisory does not include dependency paths", () => {
  const result = runAuditCheck({
    1: {
      github_advisory_id: "GHSA-test-no-path",
      module_name: "unknown-package",
      severity: "critical",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /is critical and cannot be allowlisted/);
});
