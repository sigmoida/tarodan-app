import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

describe("production reference-data bootstrap", () => {
  const apiRoot = resolve(__dirname, "..");
  const bootstrapPath = resolve(apiRoot, "prisma/seed-production.ts");
  const packageJson = JSON.parse(
    readFileSync(resolve(apiRoot, "package.json"), "utf8"),
  );

  it("uses a dedicated production bootstrap instead of the demo seed", () => {
    expect(existsSync(bootstrapPath)).toBe(true);
    expect(packageJson.scripts["seed:prod"]).toContain("seed-production");
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
});
