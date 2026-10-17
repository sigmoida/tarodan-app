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
    service = new AdminSettingsService(prisma, audit, {
      get: jest.fn(),
    } as any);
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

/**
 * Süreler ve Kurallar anahtarları genel ayar ucundan yazılamaz: sınır,
 * alanlar arası kural, açık-eylem doğrulaması ve zorunlu denetim yalnız
 * PATCH /admin/timing-rules yolunda vardır. Doğrudan gönderilen bir "yakında"
 * eylemi ya da 0 günlük pencere bu kapıdan sızamaz.
 */
describe("AdminSettingsService — Süreler ve Kurallar anahtarları", () => {
  const makeService = () => {
    const prisma: any = {
      platformSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: "s1" }),
      },
      adminUser: { findFirst: jest.fn().mockResolvedValue({ id: "admin-1" }) },
    };
    prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    const audit = { createAuditLog: jest.fn() };
    return {
      service: new AdminSettingsService(
        prisma as any,
        audit as any,
        {
          get: jest.fn(),
        } as any,
      ),
      prisma,
    };
  };

  it.each([
    ["payment_hold_days", "0"],
    ["trade_response_deadline_hours", "1"],
    ["return_window_days", "7"],
    ["listing_ttl_days_on_expiry", "auto_renew"],
    ["offer_expiry_hours_on_expiry", "extend_once"],
  ])("%s yazımını reddeder ve hiçbir şey yazmaz", async (key, value) => {
    const { service, prisma } = makeService();

    await expect(
      service.updatePlatformSetting("user-1", { key, value }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.admin.timingRules.useDedicatedEndpoint" },
    });
    await expect(
      service.updatePlatformSetting("user-1", { key, value }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it.each([
    "hero_home_enabled_web",
    "hero_home_enabled_app",
    "hero_seed_applied",
  ])("hero anahtarı %s genel uçtan yazılamaz", async (key) => {
    const { service, prisma } = makeService();

    await expect(
      service.updatePlatformSetting("user-1", { key, value: "false" }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.hero.useDedicatedEndpoint" },
    });
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("ilgisiz anahtarları eskisi gibi yazar", async () => {
    const { service, prisma } = makeService();

    await service.updatePlatformSetting("user-1", {
      key: "max_message_length",
      value: "500",
    });

    expect(prisma.platformSetting.upsert).toHaveBeenCalled();
  });
});

/**
 * `GET /admin/settings/public` ilan fiyat sınırlarını da taşır: istemci
 * formları kuralı sunucudan önce uygular. Boş / sayısal olmayan ayar
 * "kural yok" demektir — anahtar yanıtta HİÇ bulunmaz (NaN / 0 sızmaz).
 */
describe("AdminSettingsService — public price limits", () => {
  const makeService = (limits: Record<string, string | undefined>) => {
    const prisma: any = {
      platformSetting: {
        // Genel ayarlar TEK sorguda gelir; sınır satırları da bu listededir.
        findMany: jest.fn().mockResolvedValue([
          { settingKey: "max_message_length", settingValue: "800" },
          ...Object.entries(limits)
            .filter(([, value]) => value !== undefined)
            .map(([settingKey, settingValue]) => ({
              settingKey,
              settingValue: settingValue as string,
            })),
        ]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: "s1" }),
      },
      adminUser: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    return {
      service: new AdminSettingsService(
        prisma as any,
        {
          createAuditLog: jest.fn(),
        } as any,
        // MIN_OFFER_PERCENTAGE yok → varsayılan %50.
        { get: jest.fn() } as any,
      ),
      prisma,
    };
  };

  it("min ve max'i sayı olarak döndürür", async () => {
    const { service } = makeService({
      min_product_price: "250",
      max_product_price: "100000.50",
    });

    await expect(service.getPublicSettings()).resolves.toEqual({
      max_message_length: 800,
      min_product_price: 250,
      max_product_price: 100000.5,
      min_offer_percentage: 50,
    });
  });

  it("ayar satırı yoksa anahtarlar yanıtta bulunmaz", async () => {
    const { service } = makeService({});

    const result = await service.getPublicSettings();

    expect(result).toEqual({
      max_message_length: 800,
      min_offer_percentage: 50,
    });
    expect(result).not.toHaveProperty("min_product_price");
    expect(result).not.toHaveProperty("max_product_price");
  });

  it.each(["", "   ", "abc"])(
    "boş / boşluk / sayısal olmayan değer (%j) anahtarı düşürür",
    async (value) => {
      const { service } = makeService({
        min_product_price: value,
        max_product_price: value,
      });

      const result = await service.getPublicSettings();

      expect(result).not.toHaveProperty("min_product_price");
      expect(result).not.toHaveProperty("max_product_price");
    },
  );

  it("yalnız min doluysa max anahtarı yoktur", async () => {
    const { service } = makeService({
      min_product_price: "250",
      max_product_price: "",
    });

    const result = await service.getPublicSettings();

    expect(result.min_product_price).toBe(250);
    expect(result).not.toHaveProperty("max_product_price");
  });

  it("yönetici min ve max'i BOŞ kaydedebilir (kural kapanır)", async () => {
    const { service, prisma } = makeService({});

    await service.updatePlatformSetting("user-1", {
      key: "min_product_price",
      value: "",
    });

    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settingKey: "min_product_price" },
        update: expect.objectContaining({ settingValue: "" }),
      }),
    );
  });

  it("sınırlar ek sorgu olmadan tek findMany ile okunur", async () => {
    const { service, prisma } = makeService({ min_product_price: "250" });

    await service.getPublicSettings();

    expect(prisma.platformSetting.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.platformSetting.findUnique).not.toHaveBeenCalled();
    expect(
      prisma.platformSetting.findMany.mock.calls[0][0].where.settingKey.in,
    ).toEqual(
      expect.arrayContaining(["min_product_price", "max_product_price"]),
    );
  });

  it("kısmen sayısal değer ('250abc') sızmaz", async () => {
    const { service } = makeService({ min_product_price: "250abc" });

    await expect(service.getPublicSettings()).resolves.not.toHaveProperty(
      "min_product_price",
    );
  });

  it.each(["abc", "-1", "NaN", "Infinity"])(
    "geçersiz fiyat sınırı yazımı (%j) reddedilir ve yazılmaz",
    async (value) => {
      const { service, prisma } = makeService({});

      await expect(
        service.updatePlatformSetting("user-1", {
          key: "max_product_price",
          value,
        }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.settings.priceLimitInvalid" },
      });
      expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
    },
  );

  it.each(["0", "250.5", "", "  "])(
    "geçerli fiyat sınırı yazımı (%j) kabul edilir",
    async (value) => {
      const { service, prisma } = makeService({});

      await service.updatePlatformSetting("user-1", {
        key: "min_product_price",
        value,
      });

      expect(prisma.platformSetting.upsert).toHaveBeenCalled();
    },
  );

  it("sınır anahtarı dışındaki ayarlar bu denetimden etkilenmez", async () => {
    const { service, prisma } = makeService({});

    await service.updatePlatformSetting("user-1", {
      key: "max_message_length",
      value: "abc",
    });

    expect(prisma.platformSetting.upsert).toHaveBeenCalled();
  });
});

/**
 * Herkese açık ayarlar teklif alt sınırını taşır: mobil formu %50 sabit
 * varsayıyordu; sunucunun UYGULADIĞI değer (config/offer.ts) buradan okunur.
 */
describe("AdminSettingsService.getPublicSettings — min_offer_percentage", () => {
  const makeService = (env: Record<string, string>) => {
    const prisma: any = {
      platformSetting: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { settingKey: "max_message_length", settingValue: "500" },
          ]),
      },
    };
    const config = { get: jest.fn((key: string) => env[key]) };
    return new AdminSettingsService(prisma, {} as any, config as any);
  };

  it("env yoksa varsayılan %50", async () => {
    const result = await makeService({}).getPublicSettings();
    expect(result.min_offer_percentage).toBe(50);
    // mevcut alanlar değişmez
    expect(result.max_message_length).toBe(500);
  });

  it("env değerini sunucunun uyguladığı sayı olarak döner", async () => {
    const result = await makeService({
      MIN_OFFER_PERCENTAGE: "70",
    }).getPublicSettings();
    expect(result.min_offer_percentage).toBe(70);
  });

  it("0 (alt sınır yok) 0 olarak döner, %50'ye çevrilmez", async () => {
    const result = await makeService({
      MIN_OFFER_PERCENTAGE: "0",
    }).getPublicSettings();
    expect(result.min_offer_percentage).toBe(0);
  });
});
