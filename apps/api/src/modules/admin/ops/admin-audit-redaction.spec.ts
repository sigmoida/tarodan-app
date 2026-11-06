import { AdminAuditService } from "./admin-audit.service";

/**
 * Audit rows are never purged, so a sensitive value written into one stays
 * forever. The card BIN (first 6-8 card digits) is one of them
 * (docs/PCI_PAYMENT_PAGE.md).
 */
describe("AdminAuditService — redaction of stored values", () => {
  const BIN = "45467112";

  const written = async (oldValue: unknown, newValue: unknown) => {
    const db = {
      adminUser: { findFirst: jest.fn().mockResolvedValue({ id: "admin-1" }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
    };
    await new AdminAuditService(db as any).createRequiredAuditLog(
      "user-1",
      "payment_review",
      "Payment",
      "pay-1",
      oldValue,
      newValue,
    );
    return db.auditLog.create.mock.calls[0][0].data as {
      oldValue: unknown;
      newValue: unknown;
    };
  };

  it("masks a top-level and a nested installment BIN, keeps the rest", async () => {
    const data = await written(
      { bin: BIN, paymentId: "pay-1" },
      { paymentId: "pay-1", installment: { count: 3, bin: BIN } },
    );

    expect(data.oldValue).toEqual({ bin: "[GİZLİ]", paymentId: "pay-1" });
    expect(data.newValue).toEqual({
      paymentId: "pay-1",
      installment: { count: 3, bin: "[GİZLİ]" },
    });
  });

  it("masks every BIN key spelling, whatever the case", async () => {
    const keys = [
      "BIN",
      "bin6",
      "bin8",
      "binNumber",
      "bin_number",
      "cardBin",
      "installmentBin",
      "iin",
    ];
    const data = await written(
      null,
      Object.fromEntries(keys.map((key) => [key, BIN])),
    );

    expect(data.newValue).toEqual(
      Object.fromEntries(keys.map((key) => [key, "[GİZLİ]"])),
    );
  });

  it("keeps the existing keys masked and ordinary keys readable", async () => {
    const data = await written(null, {
      password: "p",
      access_token: "t",
      binary: "ok",
      status: "PAID",
    });

    expect(data.newValue).toEqual({
      password: "[GİZLİ]",
      access_token: "[GİZLİ]",
      binary: "ok",
      status: "PAID",
    });
  });
});
