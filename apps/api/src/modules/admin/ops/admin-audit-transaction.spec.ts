import { AdminAuditService } from "./admin-audit.service";

/**
 * Zorunlu denetim, değişikliğin işlem istemcisi verildiğinde AYNI işlemde
 * yazılır: denetim yazılamazsa değişiklik de geri alınır.
 */
describe("AdminAuditService.createRequiredAuditLog — işlem istemcisi", () => {
  it("db verilirse admin çözümü ve denetim satırı o istemciden yazılır", async () => {
    const root = {
      adminUser: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const tx = {
      adminUser: { findFirst: jest.fn().mockResolvedValue({ id: "admin-1" }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
    };
    const service = new AdminAuditService(root as any);

    await service.createRequiredAuditLog(
      "user-1",
      "timing_rule_update",
      "TimingRule",
      "returnWindowDays",
      { value: 14 },
      { value: 21 },
      tx as any,
    );

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: "admin-1",
        action: "timing_rule_update",
        entityType: "TimingRule",
        entityId: "returnWindowDays",
        oldValue: { value: 14 },
        newValue: { value: 21 },
      }),
    });
    expect(root.adminUser.findFirst).not.toHaveBeenCalled();
    expect(root.auditLog.create).not.toHaveBeenCalled();
  });

  it("işlem içindeki denetim hatası yükselir (işlemi geri aldırır)", async () => {
    const tx = {
      adminUser: { findFirst: jest.fn().mockResolvedValue({ id: "admin-1" }) },
      auditLog: { create: jest.fn().mockRejectedValue(new Error("down")) },
    };
    const service = new AdminAuditService({} as any);

    await expect(
      service.createRequiredAuditLog(
        "user-1",
        "timing_rule_update",
        "TimingRule",
        "returnWindowDays",
        null,
        null,
        tx as any,
      ),
    ).rejects.toThrow("down");
  });
});
