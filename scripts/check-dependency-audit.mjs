import { readFileSync } from "node:fs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let report;
try {
  report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
  console.error("Dependency audit did not return valid JSON; failing closed.");
  process.exit(1);
}

const allowlist = JSON.parse(
  readFileSync(
    new URL("../security/dependency-audit-allowlist.json", import.meta.url),
    "utf8",
  ),
);
const entries = new Map(allowlist.entries.map((entry) => [entry.ghsa, entry]));
const excludedWorkspaces = ["apps__mobile", "packages__ui-native"];
const isExcludedPath = (path) =>
  excludedWorkspaces.some(
    (workspace) => path === workspace || path.startsWith(`${workspace}>`),
  );
const advisories = Object.values(report.advisories ?? {})
  .filter((advisory) => ["high", "critical"].includes(advisory.severity))
  .map((advisory) => {
    if (!Array.isArray(advisory.findings) || advisory.findings.length === 0) {
      return advisory;
    }

    const findings = advisory.findings.filter(
      (finding) =>
        !Array.isArray(finding.paths) ||
        finding.paths.length === 0 ||
        finding.paths.some((path) => !isExcludedPath(path)),
    );

    return findings.length > 0 ? { ...advisory, findings } : null;
  })
  .filter(Boolean);

const failures = [];
const seen = new Set();
const today = new Date().toISOString().slice(0, 10);

for (const advisory of advisories) {
  const ghsa = advisory.github_advisory_id;
  seen.add(ghsa);
  const entry = entries.get(ghsa);

  if (advisory.severity === "critical") {
    failures.push(
      `${ghsa} (${advisory.module_name}) is critical and cannot be allowlisted`,
    );
  } else if (!entry) {
    failures.push(
      `${ghsa} (${advisory.module_name}) is a new high-severity advisory`,
    );
  } else if (entry.package !== advisory.module_name) {
    failures.push(
      `${ghsa} allowlist package mismatch: ${entry.package} != ${advisory.module_name}`,
    );
  } else if (!entry.reason || !entry.expires) {
    failures.push(`${ghsa} allowlist entry is missing a reason or expiry`);
  } else if (entry.expires < today) {
    failures.push(`${ghsa} allowlist entry expired on ${entry.expires}`);
  }
}

for (const entry of entries.values()) {
  if (!seen.has(entry.ghsa)) {
    console.warn(
      `Stale audit allowlist entry: ${entry.ghsa} (${entry.package})`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log(
  `Production audit passed: ${advisories.length} reviewed high advisory/advisories, no critical advisories.`,
);
