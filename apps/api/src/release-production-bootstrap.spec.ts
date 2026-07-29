import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

describe("production reference-data bootstrap", () => {
  const apiRoot = resolve(__dirname, "..");
  const repoRoot = resolve(apiRoot, "../..");
  const bootstrapPath = resolve(apiRoot, "prisma/seed-production.ts");
  const adminBootstrapPath = resolve(
    apiRoot,
    "prisma/bootstrap-production-admin.ts",
  );
  const runtimeResetPath = resolve(
    apiRoot,
    "maintenance/reset-production-runtime.ts",
  );
  const emptySmokePath = resolve(
    apiRoot,
    "maintenance/verify-production-empty.ts",
  );
  const resetWorkflowPath = resolve(
    repoRoot,
    ".github/workflows/production-reset.yml",
  );
  const packageJson = JSON.parse(
    readFileSync(resolve(apiRoot, "package.json"), "utf8"),
  );
  const entrypoint = readFileSync(resolve(apiRoot, "entrypoint.sh"), "utf8");

  it("uses a dedicated production bootstrap instead of the demo seed", () => {
    expect(existsSync(bootstrapPath)).toBe(true);
    expect(packageJson.scripts["seed:prod"]).toContain("seed-production");
    expect(entrypoint).toContain("seed-production");
  });

  it("is idempotent, seeds required business references and contains no demo credentials", () => {
    expect(existsSync(bootstrapPath)).toBe(true);
    if (!existsSync(bootstrapPath)) return;

    const source = readFileSync(bootstrapPath, "utf8");
    expect(source).toContain("upsert");
    expect(source).toMatch(/membershipTier/i);
    expect(source).toMatch(/commissionRule/i);
    expect(source).toMatch(/taxRegion|taxRate|taxRule/i);
    expect(source).toMatch(/platform@tarodan\.com/i);
    expect(source).not.toMatch(/Demo123|Admin123|demo user/i);
  });

  it("bootstraps only an explicitly configured production super admin", () => {
    expect(existsSync(adminBootstrapPath)).toBe(true);
    const source = readFileSync(adminBootstrapPath, "utf8");

    expect(source).toContain('process.env.APP_ENV !== "production"');
    expect(source).toContain("BOOTSTRAP_ADMIN_EMAIL");
    expect(source).toContain("BOOTSTRAP_ADMIN_PASSWORD");
    expect(source).toContain("AdminRole.super_admin");
    expect(source).toContain("bcrypt.hash");
    expect(source).not.toMatch(/admin@tarodan\.com|Demo123|Admin123/i);
  });

  it("clears only the selected Redis database and production search indices", () => {
    expect(existsSync(runtimeResetPath)).toBe(true);
    const source = readFileSync(runtimeResetPath, "utf8");

    expect(source).toContain('process.env.APP_ENV !== "production"');
    expect(source).toContain('prefix !== "production"');
    expect(source).toContain("flushdb");
    expect(source).not.toContain("flushall");
    expect(source).toContain("productionIndexPrefix");
    expect(source).toMatch(/products.*collections/s);
  });

  it("has an empty-catalog production smoke check", () => {
    expect(existsSync(emptySmokePath)).toBe(true);
    const source = readFileSync(emptySmokePath, "utf8");

    expect(source).toContain("/health/ready");
    expect(source).toContain("/categories");
    expect(source).toContain("/manufacturers");
    expect(source).toContain("/ads/active");
    expect(source).toContain("/products");
    expect(source).toContain("/search/products");
  });

  it("keeps production reset manual, locked, backed up and demo-seed free", () => {
    expect(existsSync(resetWorkflowPath)).toBe(true);
    const source = readFileSync(resetWorkflowPath, "utf8");

    expect(source).toContain("workflow_dispatch:");
    expect(source).not.toMatch(/^\s+push:/m);
    expect(source).not.toMatch(/^\s+schedule:/m);
    expect(source).toContain("RESET_PRODUCTION");
    expect(source).toMatch(/dry_run:[\s\S]*?default: true/);
    expect(source).toContain("environment: production");
    expect(source).toContain('SITE_LOCKED_VALUE" = "true"');
    expect(source).toContain("pg_dump -Fc");
    expect(source).toContain("pg_restore -l");
    expect(source).toContain("migrate reset --force --skip-seed");
    expect(source).toContain("seed-production.js");
    expect(source).not.toContain("dist-seed/prisma/seed.js");
    expect(source).toContain("bootstrap-production-admin.js");
    expect(source).toContain("reset-production-runtime.js");
    expect(source).toContain("verify-production-empty.js");
  });
});
