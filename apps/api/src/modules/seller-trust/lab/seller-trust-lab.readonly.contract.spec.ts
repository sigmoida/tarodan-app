import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * CONTRACT: the seller trust lab never writes (tarodan-ops plan
 * 2026-11-03-seller-trust-score-lab, 4.3 proof 2). The lab's own code (the
 * domain slice and its admin controller folder) contains no write call, no
 * cache, no queue, no event and no outbox. Its only write is the audit row,
 * through `AdminAuditService.createRequiredAuditLog`, in the admin service.
 *
 * The database enforces the same thing at run time (every read runs in a
 * READ ONLY snapshot); this spec stops a write from being added at all.
 * Comments are ignored; the walk is depth-agnostic.
 */
const ROOTS = [
  "src/modules/seller-trust/lab",
  "src/modules/admin/users/seller-trust-lab",
];

const FORBIDDEN: Array<[string, RegExp]> = [
  ["the batch upsert", /\bupsertBatch\b/],
  ["the batch cleanup", /\bdeleteStale\b/],
  ["raw writes", /\$executeRaw/],
  ["unsafe raw SQL", /\$queryRawUnsafe/],
  ["a direct transaction (use inReadOnlySnapshot)", /\$transaction\b/],
  ["a write transaction", /\binBoundedWrite\b/],
  ["create", /\.create\(/],
  ["update", /\.update\(/],
  ["upsert", /\.upsert\(/],
  ["delete", /\.delete\(/],
  ["createMany", /\bcreateMany\b/],
  ["updateMany", /\bupdateMany\b/],
  ["deleteMany", /\bdeleteMany\b/],
  ["the cache", /\bCacheService\b|\bCacheModule\b|\bsetIfAbsent\b/],
  ["a queue", /\bInjectQueue\b|\bBullModule\b/],
  ["an event", /\bEventEmitter2\b|\.emit\(/],
  ["the outbox", /outbox/i],
];

const AUDIT_WRITE = /\bcreateRequiredAuditLog\b|\bcreateAuditLog\b/;
const AUDIT_FILE =
  "src/modules/admin/users/seller-trust-lab/admin-seller-trust-lab.service.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".ts") && !name.endsWith(".spec.ts") ? [path] : [];
  });
}

/**
 * Comments removed, and a hash's `createHash(...).update(` (the audit's
 * params fingerprint) renamed, so `.update(` only matches a model write.
 */
const scannable = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/(createHash\([^)]*\)\s*)\.update\(/g, "$1.hashInput(");

describe("seller trust lab: read-only code contract", () => {
  const root = apiAppRoot();
  const files = ROOTS.flatMap((r) => sourceFiles(join(root, r))).map(
    (path) => ({
      rel: relative(root, path),
      code: scannable(readFileSync(path, "utf8")),
    }),
  );

  it("scans the lab service, its helpers and the admin controller folder", () => {
    const names = files.map((f) => f.rel);
    expect(names).toEqual(
      expect.arrayContaining([
        "src/modules/seller-trust/lab/seller-trust-lab.service.ts",
        "src/modules/seller-trust/lab/stored-inputs.helper.ts",
        "src/modules/seller-trust/lab/population-summary.helper.ts",
        "src/modules/admin/users/seller-trust-lab/admin-seller-trust-lab.controller.ts",
        AUDIT_FILE,
      ]),
    );
  });

  it("contains no write, cache, queue, event or outbox call", () => {
    const violations = files.flatMap(({ rel, code }) =>
      FORBIDDEN.filter(([, pattern]) => pattern.test(code)).map(
        ([what]) => `${rel}: ${what}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it("writes only the required (fail-closed) audit row, only in the admin service", () => {
    const writers = files
      .filter(({ code }) => AUDIT_WRITE.test(code))
      .map((f) => f.rel);
    expect(writers).toEqual([AUDIT_FILE]);
    const audit = files.find((f) => f.rel === AUDIT_FILE)!.code;
    expect(audit).not.toMatch(/\bcreateAuditLog\b/);
  });

  it("reads the database only through inReadOnlySnapshot", () => {
    const service = files.find((f) =>
      f.rel.endsWith("seller-trust-lab.service.ts"),
    )!.code;
    const snapshots = service.match(/inReadOnlySnapshot\(/g) ?? [];
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(service).not.toMatch(/this\.prisma\.(?!\s*[,)])/);
  });
});
