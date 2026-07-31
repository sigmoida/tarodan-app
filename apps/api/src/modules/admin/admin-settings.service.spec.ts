import { BadRequestException } from "@nestjs/common";
import { AdminSettingsService } from "./admin-settings.service";

describe("AdminSettingsService warehouse address", () => {
  let prisma: any;
  let audit: any;
  let service: AdminSettingsService;

  const dto = {
    fullName: "Tarodan Lojistik",
    phone: "+905000000000",
    city: "İstanbul",
    district: "Kadıköy",
    address: "Hasanpaşa Mah. Örnek Sok. No:1",
    zipCode: "34722",
  };

  beforeEach(() => {
    prisma = {
      platformSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      address: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: { findFirst: jest.fn() },
      adminUser: { findFirst: jest.fn().mockResolvedValue({ id: "admin-1" }) },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    audit = { createAuditLog: jest.fn() };
    service = new AdminSettingsService(prisma, audit);
  });

  it("returns null when the warehouse_address_id setting is unset", async () => {
    await expect(service.getWarehouseAddress()).resolves.toBeNull();
    expect(prisma.address.findUnique).not.toHaveBeenCalled();
  });

  it("resolves the address the setting points at", async () => {
    prisma.platformSetting.findUnique.mockResolvedValue({
      settingValue: "addr-1",
    });
    prisma.address.findUnique.mockResolvedValue({ id: "addr-1" });

    await expect(service.getWarehouseAddress()).resolves.toEqual({
      id: "addr-1",
    });
    expect(prisma.address.findUnique).toHaveBeenCalledWith({
      where: { id: "addr-1" },
    });
  });

  it("rejects when the platform seller account is missing", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.updateWarehouseAddress("user-1", dto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates the address under the platform seller and stores the setting", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "platform-user" });
    prisma.address.create.mockResolvedValue({ id: "addr-new" });

    const result = await service.updateWarehouseAddress("user-1", dto);

    expect(result).toEqual({ id: "addr-new" });
    expect(prisma.address.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "platform-user",
        title: "Tarodan Deposu",
        fullName: dto.fullName,
        isDefault: false,
      }),
    });
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settingKey: "warehouse_address_id" },
        update: { settingValue: "addr-new" },
      }),
    );
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "warehouse_address_update",
      "Address",
      "addr-new",
      null,
      { id: "addr-new" },
    );
  });

  it("updates the existing address in place when the setting already points at one", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "platform-user" });
    prisma.platformSetting.findUnique.mockResolvedValue({
      settingValue: "addr-old",
    });
    prisma.address.findUnique.mockResolvedValue({ id: "addr-old" });
    prisma.address.update.mockResolvedValue({ id: "addr-old" });

    await service.updateWarehouseAddress("user-1", dto);

    expect(prisma.address.update).toHaveBeenCalledWith({
      where: { id: "addr-old" },
      data: expect.objectContaining({ city: dto.city }),
    });
    expect(prisma.address.create).not.toHaveBeenCalled();
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { settingValue: "addr-old" },
      }),
    );
  });
});
