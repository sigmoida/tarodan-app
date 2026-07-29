# Production dependency audit

CI runs `pnpm audit --prod --audit-level=high` and passes the JSON report to
`scripts/check-dependency-audit.mjs`. Any new high or any critical advisory
fails the job.

Temporary high-severity exceptions live in
`security/dependency-audit-allowlist.json`. Every entry must name one GHSA,
the affected package, a concrete rationale, and an expiry date. Expired entries
fail CI; entries no longer present in the audit are reported as stale and should
be deleted in the same change that fixes the dependency.

Do not add broad package or severity suppressions. Prefer a direct upgrade or a
semver-compatible root override. A major transitive override requires focused
runtime tests before it can replace an allowlist entry.
