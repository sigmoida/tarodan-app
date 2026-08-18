import { BadRequestException } from "@nestjs/common";
import { WarehouseAddressService } from "./warehouse-address.service";

/**
 * The warehouse address is the sender on every parcel that leaves the warehouse
 * and the recipient on every parcel that arrives at it, so the resolution order
 * is load-bearing: setting row → any active admin's address → env text. These
 * tests pin that order plus the deliberate asymmetry between `resolve()` (never
 * throws) and `resolveId()` (throws, because a foreign key needs a real row).
 */

const CONFIGURED_ROW = {
  id: "addr-configured",
  fullName: "Tarodan Depo",
  address: "Depo Mah. Sevk Cad. No:1",
  city: "İstanbul",
  district: "Maltepe",
  phone: "05321112233",
};

const ADMIN_ROW = {
  id: "addr-admin",
  fullName: "Admin Adres",
  address: "Yönetim Cad. No:5",
  city: "Ankara",
  district: "Çankaya",
  phone: "05324445566",
};

type Stubs = {
  setting?: { settingValue: string | null } | null;
  addressById?: typeof CONFIGURED_ROW | null;
  admin?: { userId: string } | null;
  addressByUser?: typeof ADMIN_ROW | null;
};

function buildService(stubs: Stubs) {
  const platformSetting = {
    findUnique: jest.fn().mockResolvedValue(stubs.setting ?? null),
  };
  const address = {
    findUnique: jest.fn().mockResolvedValue(stubs.addressById ?? null),
    findFirst: jest.fn().mockResolvedValue(stubs.addressByUser ?? null),
  };
  const adminUser = {
    findFirst: jest.fn().mockResolvedValue(stubs.admin ?? null),
  };
  const prisma = { platformSetting, address, adminUser };
  return {
    service: new WarehouseAddressService(prisma as never),
    // `resolveId` always takes an explicit tx client; the same stub stands in.
    prisma,
    platformSetting,
    address,
    adminUser,
  };
}

describe("WarehouseAddressService", () => {
  const envKeys = [
    "TARODAN_WAREHOUSE_NAME",
    "TARODAN_WAREHOUSE_ADDRESS",
    "TARODAN_WAREHOUSE_CITY",
    "TARODAN_WAREHOUSE_DISTRICT",
    "TARODAN_WAREHOUSE_PHONE",
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  describe("resolve", () => {
    it("returns the row named by the warehouse_address_id setting", async () => {
      const { service, address } = buildService({
        setting: { settingValue: "addr-configured" },
        addressById: CONFIGURED_ROW,
      });

      await expect(service.resolve()).resolves.toEqual({
        id: "addr-configured",
        fullName: "Tarodan Depo",
        address: "Depo Mah. Sevk Cad. No:1",
        city: "İstanbul",
        district: "Maltepe",
        phone: "05321112233",
      });
      expect(address.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "addr-configured" } }),
      );
    });

    it("falls back to an active admin's address when the setting points nowhere", async () => {
      // Bir ayar var ama işaret ettiği satır silinmiş → admin adresine düşülür.
      const { service } = buildService({
        setting: { settingValue: "addr-deleted" },
        addressById: null,
        admin: { userId: "admin-user" },
        addressByUser: ADMIN_ROW,
      });

      await expect(service.resolve()).resolves.toMatchObject({
        id: "addr-admin",
        city: "Ankara",
      });
    });

    it("falls back to the env text when no row can be found, and never throws", async () => {
      process.env.TARODAN_WAREHOUSE_NAME = "Env Depo";
      process.env.TARODAN_WAREHOUSE_CITY = "İzmir";
      const { service } = buildService({});

      // id null: env metninin arkasında bir Address satırı yok, dolayısıyla
      // fromAddressId'ye yazılabilecek bir kimlik de yok.
      await expect(service.resolve()).resolves.toMatchObject({
        id: null,
        fullName: "Env Depo",
        city: "İzmir",
      });
    });

    it("uses the caller's transaction client when one is passed", async () => {
      const { service, platformSetting } = buildService({});
      const tx = {
        platformSetting: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ settingValue: "addr-configured" }),
        },
        address: {
          findUnique: jest.fn().mockResolvedValue(CONFIGURED_ROW),
          findFirst: jest.fn(),
        },
        adminUser: { findFirst: jest.fn() },
      };

      await expect(service.resolve(tx as never)).resolves.toMatchObject({
        id: "addr-configured",
      });
      // Çağıranın tx'i kullanıldı → servisin kendi client'ına hiç gidilmedi.
      expect(platformSetting.findUnique).not.toHaveBeenCalled();
      expect(tx.platformSetting.findUnique).toHaveBeenCalled();
    });
  });

  describe("resolveId", () => {
    it("returns the configured row's id", async () => {
      const { service, prisma } = buildService({
        setting: { settingValue: "addr-configured" },
        addressById: CONFIGURED_ROW,
      });

      await expect(service.resolveId(prisma as never)).resolves.toBe(
        "addr-configured",
      );
    });

    it("throws when no row exists — the env fallback cannot satisfy a foreign key", async () => {
      process.env.TARODAN_WAREHOUSE_NAME = "Env Depo";
      const { service, prisma } = buildService({});

      await expect(service.resolveId(prisma as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
