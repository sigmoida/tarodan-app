import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const runAuditCheck = (advisories) =>
  spawnSync(process.execPath, ["scripts/check-dependency-audit.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    input: JSON.stringify({ advisories }),
  });

test("reports high advisories from a workspace", () => {
  const result = runAuditCheck({
    1: {
      github_advisory_id: "GHSA-test-workspace",
      module_name: "workspace-package",
      severity: "high",
      findings: [
        {
          paths: ["apps__api>workspace-package"],
        },
      ],
    },
  });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /GHSA-test-workspace \(workspace-package\) is a new high-severity advisory/,
  );
});

test("reports an advisory with findings in multiple workspaces", () => {
  const result = runAuditCheck({
    1: {
      github_advisory_id: "GHSA-test-deployed-app",
      module_name: "shared-package",
      severity: "high",
      findings: [
        { paths: ["apps__web>shared-package"] },
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
