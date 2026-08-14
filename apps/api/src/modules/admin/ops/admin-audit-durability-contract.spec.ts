import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { AdminAuditService } from "./admin-audit.service";

/**
 * Dosyalar adlarıyla aranır, YOLLARIYLA değil: bu sözleşme "şu servis zorunlu
 * denetim yazıyor mu" diye sorar, "şu servis hangi klasörde duruyor" diye
 * değil. Sabit yol tutmak, dosyayı bir dilime taşıyan kişinin kapsamı sessizce
 * kaybetmesi demekti (§1 klasör düzeni).
 */
const MODULES_DIR = resolve(__dirname, "../..");

function findByName(name: string): string {
  const stack = [MODULES_DIR];
  while (stack.length) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === name) return full;
    }
  }
  throw new Error(`audit contract: ${name} bulunamadı`);
}

describe("critical admin audit durability", () => {
  it("exposes a fail-closed audit method for money and policy mutations", async () => {
    const service = new AdminAuditService({
      adminUser: {
        findFirst: jest.fn().mockResolvedValue({ id: "admin-1" }),
      },
      auditLog: {
        create: jest.fn().mockRejectedValue(new Error("audit unavailable")),
      },
    } as any);

    expect(typeof (service as any).createRequiredAuditLog).toBe("function");
    if (typeof (service as any).createRequiredAuditLog !== "function") return;

    await expect(
      (service as any).createRequiredAuditLog(
        "user-1",
        "manual_refund",
        "Payment",
        "payment-1",
        null,
        { amount: 100 },
      ),
    ).rejects.toThrow("audit unavailable");
  });

  it.each([
    "admin-refund.service.ts",
    "admin-payment.service.ts",
    "admin-payout.service.ts",
    "admin-commission.service.ts",
    "admin-tax.service.ts",
    // Katman güncelleme çekirdeği: iki admin rotası da (admin-membership +
    // membership.service) bu tek dosyaya delege eder; zorunlu denetim yazımı
    // artık burada yaşar.
    "membership-tier-update.service.ts",
  ])("uses required audit writes in %s", (filename) => {
    const source = readFileSync(findByName(filename), "utf8");
    expect(source).toContain("createRequiredAuditLog");
  });
});
