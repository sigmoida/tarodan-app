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
  const launchSmokePath = resolve(
    apiRoot,
    "maintenance/verify-production-launch.ts",
  );
  const launchSeedPath = resolve(apiRoot, "prisma/seed-launch.ts");
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
    expect(source).toMatch(/taxRegion|taxRate|taxRule/i);
    expect(source).toMatch(/platform@tarodan\.com/i);
    expect(source).not.toMatch(/Demo123|Admin123|demo user/i);
    // Komisyon BİLİNÇLİ olarak yok: bu seed her açılışta koşuyor ve eskiden demo
    // oranlarını canlıya ACTIVE yayınlıyordu (bkz. seed-independence.spec.ts).
    expect(source).not.toMatch(/commissionRule/i);
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

  it("also clears the queue Redis, which Bull reaches through its own connection", () => {
    const source = readFileSync(runtimeResetPath, "utf8");

    // REDIS_URL only covers the cache. Delayed jobs scheduled before the wipe
    // live on REDIS_HOST and would fire against deleted rows after the restart.
    expect(source).toContain('required("REDIS_HOST")');
    expect(source).toContain("clearQueueRedis");
    expect(source).toContain("clearCacheRedis");
  });

  it("never flushes a whole Redis server from the staging reset", () => {
    // Staging and production share the Coolify host; flushall there would take
    // production's cache and queues with it.
    const stagingWorkflow = readFileSync(
      resolve(repoRoot, ".github/workflows/staging-reset.yml"),
      "utf8",
    );
    expect(stagingWorkflow).not.toContain("flushall()");
    expect(stagingWorkflow).toContain("flushdb()");
  });

  it("reports the package-tier prices that still need an operator decision", () => {
    const source = readFileSync(launchSmokePath, "utf8");

    expect(source).toContain("/shipping/package-tiers");
    expect(source).toContain("REVIEW");
  });

  it("keeps launch shipping prices out of the seed, where migrations already win", () => {
    const source = readFileSync(bootstrapPath, "utf8");

    // The tariff and its tiers are created by migrations, so this upsert always
    // takes the update branch. Divergent "nicer" defaults here would be dead
    // code that silently disagrees with production.
    expect(source).not.toMatch(/\[100, ?130, ?160\]/);
    expect(source).toContain("LAUNCH_TARIFF_PACKAGE_FEE");
  });

  it("smoke-checks the seeded catalog and that no listing is publicly visible", () => {
    expect(existsSync(launchSmokePath)).toBe(true);
    const source = readFileSync(launchSmokePath, "utf8");

    expect(source).toContain("/health/ready");
    expect(source).toContain("/categories");
    expect(source).toContain("/manufacturers");
    expect(source).toContain("/ads/active");
    expect(source).toContain("/products");
    expect(source).toContain("/search/products");
    // Asıl risk boşluk değil ters yönü: lansman ilanlarının onaysız vitrine
    // düşmesi. Public uçlar hâlâ BOŞ dönmeli, katalog uçları ise sayılmalı.
    expect(source).toContain('assertEmpty(baseUrl, "/products');
    expect(source).toContain("assertCount(");
  });

  it("seeds the launch catalog from data files, independently of the demo seed", () => {
    expect(existsSync(launchSeedPath)).toBe(true);
    const source = readFileSync(launchSeedPath, "utf8");

    expect(source).toContain('process.env.APP_ENV !== "production"');
    expect(source).toContain("LAUNCH_SELLER_PASSWORD");
    expect(source).toContain("warehouse_address_id");
    expect(source).toContain("ProductStatus");
    // İlanlar görselsiz ve inactive geliyor; hiçbir görsel satırı yazılmamalı.
    expect(source).not.toContain("productImage");
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
    expect(source).toContain("seed-launch.js");
    expect(source).toContain("reset-production-runtime.js");
    expect(source).toContain("verify-production-launch.js");
    // Lansman seed'i depo adresini süper admine bağlıyor: sıra bozulursa
    // "no active super admin" ile veritabanı silindikten SONRA patlar.
    expect(source.indexOf("bootstrap-production-admin.js")).toBeLessThan(
      source.indexOf("seed-launch.js"),
    );
  });

  it("fails a mistyped confirmation instead of skipping into a green run", () => {
    const source = readFileSync(resetWorkflowPath, "utf8");

    expect(source).toMatch(/jobs:[\s\S]*?guard:/);
    expect(source).toContain("needs: guard");
    expect(source).not.toContain("if: ${{ inputs.confirm ==");
  });

  it("guards API_URL as an origin and preflights the runtime-reset env", () => {
    const source = readFileSync(resetWorkflowPath, "utf8");

    // The app appends /api itself; a suffixed value yields /api/api/... links.
    expect(source).toContain("https://api.tarodan.com.tr)");
    expect(source).not.toContain("https://api.tarodan.com.tr/api");
    // These are only required by the runtime reset, which runs after the wipe.
    expect(source).toContain("REDIS_URL REDIS_HOST");
    expect(source).toContain("ELASTICSEARCH_NODE|ELASTICSEARCH_URL");
  });

  it("keeps the inline DATABASE_URL parser syntactically valid", () => {
    // Bu betik ÜÇ kaçış katmanından geçiyor: YAML blok skaları → tek tırnaklı
    // shell dizesi → `node -e`. Bir dönem `/^\\//` yazıyordu; node'a çift ters
    // bölü ulaşıp regex erken kapanıyor, reset daha guard aşamasında
    // SyntaxError ile ölüyordu. Hiçbir test görmüyordu çünkü betik yalnız
    // sunucuda çalışır — burada en azından ayrıştırılabilirliğini doğruluyoruz.
    const source = readFileSync(resetWorkflowPath, "utf8");
    const inlineScript = source.match(/node -e '\n([\s\S]*?)\n\s*'\)"/);

    expect(inlineScript).not.toBeNull();
    // new Function yalnız PARSE eder, çalıştırmaz — process/Buffer/URL gerekmez.
    expect(() => new Function(inlineScript![1])).not.toThrow();
  });

  it("restarts the admin app it never used to touch", () => {
    const source = readFileSync(resetWorkflowPath, "utf8");

    expect(source).toContain("ADMIN_UUID");
    expect(source).toContain("ADMIN_CID");
  });
});
