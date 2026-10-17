import { BadRequestException, ConflictException } from "@nestjs/common";
import { AdvertisementService } from "./advertisement.service";
import type { PrismaService } from "../../prisma";
import type { UpdateAdvertisementDto } from "./dto/update-advertisement.dto";
import type { MediaService } from "../media/media.service";
import { AD_IMAGE_UPLOAD } from "./helpers/ad-image-upload.constants";

/**
 * Reklam CRUD sözleşmesi: güncellemede `null` = temizle, alan yok = dokunma;
 * yayın penceresi ters olamaz (saklı öbür uçla birlikte); admin yanıtı bağlı
 * kampanyanın özetini taşır; vitrin seçimi yalnız yayındaki reklamları
 * `displayOrder ASC, createdAt DESC` sırasıyla döner.
 */

const NOW = new Date("2026-10-09T09:00:00Z");

const row = (over: Record<string, unknown> = {}) => ({
  id: "ad-1",
  title: "Banner",
  imageUrl: "https://cdn.test/a.png",
  linkUrl: "/kategori/x",
  content: "metin",
  altText: "alt",
  width: 728,
  height: 90,
  position: "header",
  platform: "all",
  deviceType: "all",
  popupFrequency: "until_dismissed",
  popupVersion: 1,
  displayOrder: 0,
  isActive: true,
  startDate: new Date("2026-10-01T00:00:00+03:00"),
  endDate: new Date("2026-10-31T23:59:59.999+03:00"),
  clickCount: 0,
  impressionCount: 0,
  discountId: null,
  discount: null,
  hotspots: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

function makeService(existing: Record<string, unknown> | null = row()) {
  const advertisement = {
    findUnique: jest.fn().mockResolvedValue(existing),
    findMany: jest.fn().mockResolvedValue([]),
    // Yuva kuralı sorgusu: varsayılan "yuva boş".
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
      row({ ...data, hotspots: [] }),
    ),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
      row({ ...existing, ...data }),
    ),
    delete: jest.fn(),
  };
  const discount = {
    findUnique: jest.fn().mockResolvedValue({ id: "disc-1" }),
  };
  const adHotspot = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  // Yuva kilidi (`pg_advisory_xact_lock`) etiketli şablonla çağrılır.
  const $executeRaw = jest.fn().mockResolvedValue(0);
  const mock: Record<string, unknown> = {
    advertisement,
    discount,
    adHotspot,
    $executeRaw,
  };
  // İnteraktif işlem aynı istemciyle çalışır: tx üzerindeki çağrılar aynı
  // mock'lara düşer.
  const $transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(mock),
  );
  mock.$transaction = $transaction;
  const prisma = mock as unknown as PrismaService;
  const media = {
    upload: jest.fn().mockResolvedValue({ url: "https://cdn.test/ads/a.webp" }),
  };
  return {
    service: new AdvertisementService(prisma, media as unknown as MediaService),
    advertisement,
    discount,
    adHotspot,
    $transaction,
    $executeRaw,
    media,
  };
}

const updateData = (advertisement: { update: jest.Mock }) =>
  advertisement.update.mock.calls[0][0].data as Record<string, unknown>;

describe("AdvertisementService.update — null temizler, yokluk dokunmaz", () => {
  const CLEARABLE = [
    "imageUrl",
    "linkUrl",
    "content",
    "altText",
    "width",
    "height",
    "startDate",
    "endDate",
    "discountId",
  ] as const;

  it.each(CLEARABLE)("%s: null → Prisma'ya null yazılır", async (field) => {
    const { service, advertisement } = makeService();
    await service.update("ad-1", {
      [field]: null,
    } as UpdateAdvertisementDto);
    expect(updateData(advertisement)[field]).toBeNull();
  });

  it("gönderilmeyen alanların hiçbiri yazılmaz (undefined = dokunma)", async () => {
    // Görselsiz reklam: görselli reklamda linkUrl kural gereği daima null
    // yazılır (aşağıdaki "tıklanabilir alanlar" bölümü).
    const { service, advertisement } = makeService(
      row({ imageUrl: null, linkUrl: "/kategori/x" }),
    );
    await service.update("ad-1", { isActive: false });
    const data = updateData(advertisement);
    expect(data.isActive).toBe(false);
    for (const field of [
      ...CLEARABLE,
      "title",
      "position",
      "platform",
      "deviceType",
      "popupFrequency",
      "displayOrder",
    ]) {
      expect(data[field]).toBeUndefined();
    }
  });

  it("tarih ofsetli ISO olarak gelir, aynı an olarak saklanır", async () => {
    const { service, advertisement } = makeService(
      row({ startDate: null, endDate: null }),
    );
    await service.update("ad-1", {
      startDate: "2026-11-01T00:00:00.000+03:00",
      endDate: "2026-11-30T23:59:59.999+03:00",
    });
    const data = updateData(advertisement);
    expect((data.startDate as Date).toISOString()).toBe(
      "2026-10-31T21:00:00.000Z",
    );
    expect((data.endDate as Date).toISOString()).toBe(
      "2026-11-30T20:59:59.999Z",
    );
  });

  it("boş dize kampanya bağını da kaldırır (geriye dönük)", async () => {
    const { service, advertisement } = makeService();
    await service.update("ad-1", { discountId: "" });
    expect(updateData(advertisement).discountId).toBeNull();
  });
});

describe("AdvertisementService — yayın penceresi sırası", () => {
  const expectEndBeforeStart = async (promise: Promise<unknown>) => {
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toMatchObject({
      response: { i18nKey: "server.advertisement.endBeforeStart" },
    });
  };

  it("oluştururken bitiş başlangıçtan önceyse 400", async () => {
    const { service, advertisement } = makeService();
    await expectEndBeforeStart(
      service.create({
        title: "X",
        startDate: "2026-11-02T00:00:00.000+03:00",
        endDate: "2026-11-01T23:59:59.999+03:00",
      }),
    );
    expect(advertisement.create).not.toHaveBeenCalled();
  });

  it("aynı gün (00:00 → 23:59:59.999) geçerlidir", async () => {
    const { service, advertisement } = makeService();
    await service.create({
      title: "X",
      startDate: "2026-11-01T00:00:00.000+03:00",
      endDate: "2026-11-01T23:59:59.999+03:00",
    });
    expect(advertisement.create).toHaveBeenCalled();
  });

  it("yalnız başlangıç değişirse saklı bitişle karşılaştırılır", async () => {
    const { service, advertisement } = makeService(
      row({ endDate: new Date("2026-10-31T20:59:59.999Z") }),
    );
    await expectEndBeforeStart(
      service.update("ad-1", { startDate: "2026-11-05T00:00:00.000+03:00" }),
    );
    expect(advertisement.update).not.toHaveBeenCalled();
  });

  it("yalnız bitiş değişirse saklı başlangıçla karşılaştırılır", async () => {
    const { service } = makeService(
      row({ startDate: new Date("2026-10-10T21:00:00.000Z") }),
    );
    await expectEndBeforeStart(
      service.update("ad-1", { endDate: "2026-10-05T23:59:59.999+03:00" }),
    );
  });

  it("başlangıç temizlenince saklı bitiş tek başına geçerlidir", async () => {
    const { service, advertisement } = makeService(
      row({ startDate: new Date("2026-12-01T00:00:00Z") }),
    );
    await service.update("ad-1", {
      startDate: null,
      endDate: "2026-11-01T23:59:59.999+03:00",
    });
    expect(advertisement.update).toHaveBeenCalled();
  });
});

describe("AdvertisementService.checkIABCompliance", () => {
  it("topbar şeridi 970×90 (Large Leaderboard) IAB uyumlu sayılır", () => {
    const { service } = makeService();
    expect(service.checkIABCompliance(970, 90)).toEqual({
      isCompliant: true,
      matchedSize: "Large Leaderboard",
      suggestions: [],
    });
  });
});

describe("AdvertisementService.create — varsayılanlar", () => {
  it("yuva/platform/sıklık/sıra/anahtar gönderilmezse header/all/until_dismissed/0/true", async () => {
    const { service, advertisement } = makeService();
    await service.create({ title: "X" });
    expect(advertisement.create.mock.calls[0][0].data).toMatchObject({
      position: "header",
      platform: "all",
      deviceType: "all",
      popupFrequency: "until_dismissed",
      displayOrder: 0,
      isActive: true,
      imageUrl: null,
      linkUrl: null,
      startDate: null,
      endDate: null,
      discountId: null,
    });
  });

  it("topbar yuvasıyla oluşturulabilir", async () => {
    const { service, advertisement } = makeService();
    await service.create({ title: "Şerit", position: "topbar" });
    expect(advertisement.create.mock.calls[0][0].data.position).toBe("topbar");
  });
});

describe("AdvertisementService — admin yanıtında kampanya özeti", () => {
  const campaign = {
    id: "disc-1",
    name: "Ekim",
    isActive: true,
    startDate: new Date("2026-10-01T00:00:00Z"),
    endDate: new Date("2026-10-05T00:00:00Z"),
  };

  it("findAll bağlı kampanyayı yalnız özet alanlarıyla seçer ve döner", async () => {
    const { service, advertisement } = makeService();
    advertisement.findMany.mockResolvedValue([
      row({ discountId: "disc-1", discount: campaign }),
      row({ id: "ad-2" }),
    ]);

    const [linked, plain] = await service.findAll();

    expect(advertisement.findMany.mock.calls[0][0].include).toEqual({
      discount: {
        select: {
          id: true,
          name: true,
          isActive: true,
          startDate: true,
          endDate: true,
          budgetStoppedAt: true,
        },
      },
      hotspots: {
        select: {
          id: true,
          x: true,
          y: true,
          width: true,
          height: true,
          label: true,
          linkUrl: true,
          sortOrder: true,
          clickCount: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    });
    expect(linked.discountId).toBe("disc-1");
    expect(linked.discount).toEqual(campaign);
    expect(plain.discountId).toBeNull();
    expect(plain.discount).toBeNull();
  });

  it("findAll: yayında olup aynı yuvada önce gelen reklam yüzünden görünmeyenleri işaretler", async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    try {
      const { service, advertisement } = makeService();
      advertisement.findMany.mockResolvedValue([
        // Sıra vitrinle aynı: ilk gelen yuvayı alır.
        row({ id: "web-1", position: "popup", platform: "web" }),
        row({ id: "all-1", position: "popup", platform: "all" }),
        row({ id: "app-1", position: "popup", platform: "app" }),
        row({ id: "off", position: "popup", platform: "all", isActive: false }),
        row({ id: "hdr", position: "header", platform: "all" }),
      ]);

      const list = await service.findAll();
      const byId = Object.fromEntries(list.map((a) => [a.id, a.shadowedOn]));
      // web'de web-1 kazanır; app'te all-1 kazanır → all-1 yalnız web'de gizli.
      expect(byId).toEqual({
        "web-1": [],
        "all-1": ["web"],
        "app-1": ["app"],
        off: [],
        hdr: [],
      });
      // Süzülmemiş liste ikinci sorgu yapmaz.
      expect(advertisement.findMany).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("findAll süzülmüşse gölge yine TÜM yayındaki reklamlardan hesaplanır", async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    try {
      const { service, advertisement } = makeService();
      advertisement.findMany
        .mockResolvedValueOnce([
          row({ id: "app-1", position: "popup", platform: "app" }),
        ])
        .mockResolvedValueOnce([
          row({ id: "all-1", position: "popup", platform: "all" }),
          row({ id: "app-1", position: "popup", platform: "app" }),
        ]);

      const [ad] = await service.findAll(undefined, "app");
      expect(ad.shadowedOn).toEqual(["app"]);
      expect(advertisement.findMany).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("findOne, create ve update de aynı özeti taşır", async () => {
    const { service, advertisement } = makeService(
      row({ discountId: "disc-1", discount: campaign }),
    );
    expect((await service.findOne("ad-1")).discount).toEqual(campaign);

    await service.create({ title: "X" });
    expect(advertisement.create.mock.calls[0][0]).toHaveProperty("include");

    await service.update("ad-1", { title: "Y" });
    expect(advertisement.update.mock.calls[0][0]).toHaveProperty("include");
  });
});

describe("AdvertisementService.getActive — vitrin seçimi", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it("bilinmeyen yuva (kaldırılan sidebar) sorgusuz boş döner", async () => {
    const { service, advertisement } = makeService();
    await expect(service.getActive("sidebar")).resolves.toEqual([]);
    expect(advertisement.findMany).not.toHaveBeenCalled();
  });

  it("topbar yuvasını süzer, displayOrder ASC + createdAt DESC sıralar", async () => {
    const { service, advertisement } = makeService();
    await service.getActive("topbar", "web");
    const args = advertisement.findMany.mock.calls[0][0];
    expect(args.where.position).toBe("topbar");
    expect(args.where.platform).toEqual({ in: ["web", "all"] });
    expect(args.where).not.toHaveProperty("deviceType");
    expect(args.orderBy).toEqual([
      { displayOrder: "asc" },
      { createdAt: "desc" },
    ]);
  });

  it("platform yoksa app (eski mobil sürüm)", async () => {
    const { service, advertisement } = makeService();
    await service.getActive("header");
    expect(advertisement.findMany.mock.calls[0][0].where.platform).toEqual({
      in: ["app", "all"],
    });
  });

  it("platform yok, eski device var → web (eski web istemcisi); device süzmez", async () => {
    const { service, advertisement } = makeService();
    await service.getActive("header", undefined, "mobile");
    const where = advertisement.findMany.mock.calls[0][0].where;
    expect(where.platform).toEqual({ in: ["web", "all"] });
    expect(where).not.toHaveProperty("deviceType");
  });

  it("platform esastır: device ile çelişse de platform kazanır", async () => {
    const { service, advertisement } = makeService();
    await service.getActive("header", "app", "desktop");
    expect(advertisement.findMany.mock.calls[0][0].where.platform).toEqual({
      in: ["app", "all"],
    });
  });

  it("bilinmeyen platform sorgusuz boş döner", async () => {
    const { service, advertisement } = makeService();
    await expect(service.getActive("header", "ios")).resolves.toEqual([]);
    expect(advertisement.findMany).not.toHaveBeenCalled();
  });

  it("yuva başına en fazla bir reklam: sıradaki ilk canlı olan", async () => {
    const { service, advertisement } = makeService();
    advertisement.findMany.mockResolvedValue([
      // Yayında değil (pasif) → sayılmaz, sıradaki canlı olan seçilir.
      row({ id: "h0", position: "header", isActive: false }),
      row({ id: "h1", position: "header" }),
      row({ id: "p1", position: "popup" }),
      row({ id: "h2", position: "header" }),
      row({ id: "p2", position: "popup" }),
    ]);
    const ads = await service.getActive();
    expect(ads.map((a) => a.id)).toEqual(["h1", "p1"]);
  });

  it("platform, popup sıklığı/sürümü döner; deviceType platformdan türetilir", async () => {
    const { service, advertisement } = makeService();
    advertisement.findMany.mockResolvedValue([
      // Kolon bayat olsa da (desktop) yanıt platformdan türetilir.
      row({
        id: "a",
        position: "popup",
        platform: "app",
        deviceType: "desktop",
        popupFrequency: "every_visit",
        popupVersion: 4,
      }),
      row({ id: "b", position: "header", platform: "all" }),
      row({ id: "c", position: "footer", platform: "web" }),
    ]);
    const ads = await service.getActive(undefined, "web");
    expect(ads.map((a) => [a.id, a.platform, a.deviceType])).toEqual([
      ["a", "app", "mobile"],
      ["b", "all", "all"],
      ["c", "web", "desktop"],
    ]);
    expect(ads[0]).toMatchObject({
      popupFrequency: "every_visit",
      popupVersion: 4,
    });
  });

  it("yayındaki tüm reklamları döner, kampanyası biten düşer", async () => {
    const { service, advertisement } = makeService();
    const liveCampaign = {
      id: "c1",
      name: "Canlı",
      code: "EKIM",
      target: "product_price",
      isFlashSale: true,
      isActive: true,
      startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: new Date("2026-10-20T00:00:00Z"),
      budgetStoppedAt: null,
    };
    // Ayrı yuvalar: yuva başına tek reklam kuralı burada konu değil.
    advertisement.findMany.mockResolvedValue([
      row({ id: "a", position: "header", discount: null }),
      row({ id: "b", position: "topbar", discount: liveCampaign }),
      row({
        id: "c",
        position: "footer",
        discount: {
          ...liveCampaign,
          endDate: new Date("2026-10-02T00:00:00Z"),
        },
      }),
    ]);

    const ads = await service.getActive();

    expect(ads.map((a) => a.id)).toEqual(["a", "b"]);
    expect(ads[1].campaign).toMatchObject({
      code: "EKIM",
      isFlashSale: true,
      endsAt: liveCampaign.endDate,
    });
  });
});

describe("AdvertisementService.uploadImage", () => {
  it("dosyayı reklam hedefine (products/ads, 5MB, jpeg/png/webp) yükler", async () => {
    const { service, media } = makeService();
    const file = { originalname: "a.png" } as Express.Multer.File;

    await expect(service.uploadImage(file)).resolves.toEqual({
      url: "https://cdn.test/ads/a.webp",
    });
    expect(media.upload).toHaveBeenCalledWith(file, AD_IMAGE_UPLOAD);
    expect(AD_IMAGE_UPLOAD).toMatchObject({
      bucket: "products",
      folder: "ads",
    });
  });

  it("dosya yoksa 400", async () => {
    const { service, media } = makeService();
    await expect(service.uploadImage(undefined)).rejects.toMatchObject({
      response: { i18nKey: "server.admin.fileMissing" },
    });
    expect(media.upload).not.toHaveBeenCalled();
  });
});

describe("AdvertisementService — tıklanabilir alanlar (hotspot)", () => {
  const H1 = "11111111-1111-4111-8111-111111111111";
  const H2 = "22222222-2222-4222-8222-222222222222";
  const FOREIGN = "99999999-9999-4999-8999-999999999999";

  const left = {
    x: 0,
    y: 0,
    width: 0.5,
    height: 1,
    label: "Sol",
    linkUrl: "/sol",
  };
  const right = {
    x: 0.5,
    y: 0,
    width: 0.5,
    height: 1,
    label: "Sağ",
    linkUrl: "https://x.com",
  };

  const textAd = () => row({ imageUrl: null, linkUrl: "/kategori/x" });
  const imageAd = (ids: string[] = []) =>
    row({ linkUrl: null, hotspots: ids.map((id) => ({ id })) });

  const expectI18n = async (promise: Promise<unknown>, i18nKey: string) => {
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toMatchObject({ response: { i18nKey } });
  };

  describe("create", () => {
    it("görselli reklam: alanlar (sıra = sortOrder) reklamla birlikte oluşur, linkUrl null", async () => {
      const { service, advertisement } = makeService();
      await service.create({
        title: "X",
        imageUrl: "https://cdn.test/a.png",
        linkUrl: "/yok-sayilir",
        hotspots: [left, right],
      });
      const data = advertisement.create.mock.calls[0][0].data;
      expect(data.linkUrl).toBeNull();
      expect(data.hotspots).toEqual({
        create: [
          { ...left, sortOrder: 0 },
          { ...right, sortOrder: 1 },
        ],
      });
    });

    it("görselli reklam alansız oluşturulabilir (tıklanamaz görsel)", async () => {
      const { service, advertisement } = makeService();
      await service.create({ title: "X", imageUrl: "https://cdn.test/a.png" });
      const data = advertisement.create.mock.calls[0][0].data;
      expect(data.hotspots).toBeUndefined();
      expect(data.linkUrl).toBeNull();
    });

    it("görselsiz reklam tek linkUrl'ini korur", async () => {
      const { service, advertisement } = makeService();
      await service.create({ title: "X", linkUrl: "/kategori/x" });
      expect(advertisement.create.mock.calls[0][0].data.linkUrl).toBe(
        "/kategori/x",
      );
    });

    it("görselsiz reklama alan 400 (hotspotsNeedImage)", async () => {
      const { service, advertisement } = makeService();
      await expectI18n(
        service.create({ title: "X", hotspots: [left] }),
        "server.advertisement.hotspotsNeedImage",
      );
      expect(advertisement.create).not.toHaveBeenCalled();
    });

    it("geçersiz alan listesi ilk hatayla 400 (hotspotInvalid + kod/sıra)", async () => {
      const { service, advertisement } = makeService();
      const promise = service.create({
        title: "X",
        imageUrl: "https://cdn.test/a.png",
        hotspots: [left, { ...right, x: 0.4 }],
      });
      await expectI18n(promise, "server.advertisement.hotspotInvalid");
      await expect(promise).rejects.toMatchObject({
        response: {
          i18nParams: { code: "overlap", index: 1, position: 2, other: 1 },
        },
      });
      expect(advertisement.create).not.toHaveBeenCalled();
    });
  });

  describe("update — küme değişimi", () => {
    it("kalan id güncellenir (tık sayacına dokunulmaz), eksik silinir, yeni eklenir; tek işlemde", async () => {
      const { service, advertisement, adHotspot, $transaction } = makeService(
        imageAd([H1, H2]),
      );
      await service.update("ad-1", {
        hotspots: [{ ...right, id: H2 }, left],
      });

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(adHotspot.deleteMany).toHaveBeenCalledWith({
        where: { advertisementId: "ad-1", id: { notIn: [H2] } },
      });
      expect(adHotspot.update).toHaveBeenCalledTimes(1);
      expect(adHotspot.update).toHaveBeenCalledWith({
        where: { id: H2 },
        data: { ...right, sortOrder: 0 },
      });
      expect(adHotspot.update.mock.calls[0][0].data).not.toHaveProperty(
        "clickCount",
      );
      expect(adHotspot.createMany).toHaveBeenCalledWith({
        data: [{ ...left, sortOrder: 1, advertisementId: "ad-1" }],
      });
      // Reklam satırı alanlardan SONRA, aynı işlemde yazılır.
      expect(advertisement.update).toHaveBeenCalledTimes(1);
      expect(adHotspot.createMany.mock.invocationCallOrder[0]).toBeLessThan(
        advertisement.update.mock.invocationCallOrder[0],
      );
    });

    it("başka reklamın ya da bilinmeyen id yeni alan sayılır, asla güncellenmez", async () => {
      const { service, adHotspot } = makeService(imageAd([H1]));
      await service.update("ad-1", { hotspots: [{ ...left, id: FOREIGN }] });

      expect(adHotspot.update).not.toHaveBeenCalled();
      expect(adHotspot.deleteMany).toHaveBeenCalledWith({
        where: { advertisementId: "ad-1", id: { notIn: [] } },
      });
      const created = adHotspot.createMany.mock.calls[0][0].data;
      expect(created).toHaveLength(1);
      expect(created[0]).not.toHaveProperty("id");
    });

    it("boş liste tüm alanları siler", async () => {
      const { service, adHotspot } = makeService(imageAd([H1, H2]));
      await service.update("ad-1", { hotspots: [] });
      expect(adHotspot.deleteMany).toHaveBeenCalledWith({
        where: { advertisementId: "ad-1", id: { notIn: [] } },
      });
      expect(adHotspot.createMany).not.toHaveBeenCalled();
    });

    it("alan gönderilmez ve görsel aynı kalırsa alanlara dokunulmaz", async () => {
      const { service, adHotspot } = makeService(imageAd([H1]));
      await service.update("ad-1", {
        title: "Y",
        imageUrl: "https://cdn.test/a.png",
      });
      expect(adHotspot.deleteMany).not.toHaveBeenCalled();
      expect(adHotspot.update).not.toHaveBeenCalled();
      expect(adHotspot.createMany).not.toHaveBeenCalled();
    });

    it("geçersiz liste 400; hiçbir şey yazılmaz", async () => {
      const { service, advertisement, adHotspot } = makeService(imageAd([H1]));
      await expectI18n(
        service.update("ad-1", { hotspots: [{ ...left, width: 0.01 }] }),
        "server.advertisement.hotspotInvalid",
      );
      expect(adHotspot.deleteMany).not.toHaveBeenCalled();
      expect(advertisement.update).not.toHaveBeenCalled();
    });
  });

  describe("update — görsel/bağlantı kuralları (sonuç reklam üzerinde)", () => {
    it("görselli reklamda gönderilen linkUrl yok sayılır, null yazılır", async () => {
      const { service, advertisement } = makeService(imageAd());
      await service.update("ad-1", { linkUrl: "/kategori/y" });
      expect(updateData(advertisement).linkUrl).toBeNull();
    });

    it("görselsiz reklamda linkUrl gönderildiği gibi yazılır, alanlara dokunulmaz", async () => {
      const { service, advertisement, adHotspot } = makeService(textAd());
      await service.update("ad-1", { linkUrl: "/kategori/y" });
      expect(updateData(advertisement).linkUrl).toBe("/kategori/y");
      expect(adHotspot.deleteMany).not.toHaveBeenCalled();
    });

    it("görselsiz reklama alan 400 (hotspotsNeedImage)", async () => {
      const { service, advertisement } = makeService(textAd());
      await expectI18n(
        service.update("ad-1", { hotspots: [left] }),
        "server.advertisement.hotspotsNeedImage",
      );
      expect(advertisement.update).not.toHaveBeenCalled();
    });

    it("görsel kaldırılırsa alanları aynı işlemde silinir", async () => {
      const { service, advertisement, adHotspot, $transaction } = makeService(
        imageAd([H1, H2]),
      );
      await service.update("ad-1", { imageUrl: null, linkUrl: "/kategori/x" });
      expect($transaction).toHaveBeenCalledTimes(1);
      expect(adHotspot.deleteMany).toHaveBeenCalledWith({
        where: { advertisementId: "ad-1" },
      });
      const data = updateData(advertisement);
      expect(data.imageUrl).toBeNull();
      expect(data.linkUrl).toBe("/kategori/x");
    });

    it("görsel kaldırılırken alan gönderilirse 400", async () => {
      const { service, advertisement } = makeService(imageAd([H1]));
      await expectI18n(
        service.update("ad-1", { imageUrl: null, hotspots: [left] }),
        "server.advertisement.hotspotsNeedImage",
      );
      expect(advertisement.update).not.toHaveBeenCalled();
    });

    it("görsel değişti, alan gönderilmedi → eski alanlar silinir (oran farklı olabilir)", async () => {
      const { service, adHotspot } = makeService(imageAd([H1]));
      await service.update("ad-1", { imageUrl: "https://cdn.test/yeni.png" });
      expect(adHotspot.deleteMany).toHaveBeenCalledWith({
        where: { advertisementId: "ad-1" },
      });
      expect(adHotspot.createMany).not.toHaveBeenCalled();
    });

    it("görsel değişti ve alanlar da gönderildi → gönderilen küme geçerli", async () => {
      const { service, adHotspot } = makeService(imageAd([H1]));
      await service.update("ad-1", {
        imageUrl: "https://cdn.test/yeni.png",
        hotspots: [{ ...left, id: H1 }],
      });
      expect(adHotspot.deleteMany).toHaveBeenCalledTimes(1);
      expect(adHotspot.deleteMany).toHaveBeenCalledWith({
        where: { advertisementId: "ad-1", id: { notIn: [H1] } },
      });
      expect(adHotspot.update).toHaveBeenCalledTimes(1);
    });

    it("görselsiz reklama görsel eklenince eski linkUrl temizlenir", async () => {
      const { service, advertisement } = makeService(textAd());
      await service.update("ad-1", {
        imageUrl: "https://cdn.test/a.png",
        hotspots: [left],
      });
      expect(updateData(advertisement).linkUrl).toBeNull();
    });
  });

  describe("yanıtlar", () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
    afterEach(() => jest.useRealTimers());

    it("admin yanıtı alanları tık sayısıyla taşır", async () => {
      const hotspot = { id: H1, ...left, sortOrder: 0, clickCount: 7 };
      const { service } = makeService(row({ hotspots: [hotspot] }));
      expect((await service.findOne("ad-1")).hotspots).toEqual([hotspot]);
    });

    it("vitrin alanları tık sayısı OLMADAN, sortOrder sırasıyla seçer ve döner", async () => {
      const { service, advertisement } = makeService();
      const hotspot = { id: H1, ...left, sortOrder: 0 };
      advertisement.findMany.mockResolvedValue([
        row({ linkUrl: null, hotspots: [hotspot] }),
      ]);

      const [ad] = await service.getActive("header", "app");

      expect(advertisement.findMany.mock.calls[0][0].include.hotspots).toEqual({
        select: {
          id: true,
          x: true,
          y: true,
          width: true,
          height: true,
          label: true,
          linkUrl: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      });
      expect(ad.hotspots).toEqual([hotspot]);
      expect(ad.linkUrl).toBeNull();
    });

    describe("legacy linkUrl (store 1.0.5 reads only linkUrl)", () => {
      const first = { id: H1, ...left, sortOrder: 0 };
      const second = { id: H2, ...right, sortOrder: 1 };
      const liveAds = (advertisement: { findMany: jest.Mock }) =>
        advertisement.findMany.mockResolvedValue([
          row({
            id: "img",
            position: "header",
            linkUrl: null,
            hotspots: [first, second],
          }),
          row({ id: "bare", position: "popup", linkUrl: null, hotspots: [] }),
          row({
            id: "txt",
            position: "topbar",
            imageUrl: null,
            linkUrl: "/kategori/x",
          }),
          // Migrated as an image ad (`image_url <> ''`) although blank.
          row({
            id: "blank",
            position: "footer",
            imageUrl: " ",
            linkUrl: null,
            hotspots: [second],
          }),
        ]);
      const links = (ads: Array<{ id: string; linkUrl: string | null }>) =>
        Object.fromEntries(ads.map((a) => [a.id, a.linkUrl]));

      it("no platform, no device: image ad gets the first hotspot link; text ad and bare image ad unchanged", async () => {
        const { service, advertisement } = makeService();
        liveAds(advertisement);
        const ads = await service.getActive();
        expect(links(ads)).toEqual({
          img: "/sol",
          bare: null,
          txt: "/kategori/x",
          blank: "https://x.com",
        });
        // Hotspots are still returned as stored.
        expect(ads[0].hotspots).toEqual([first, second]);
      });

      it.each([
        ["platform=app", "app", undefined],
        ["platform=web", "web", undefined],
        ["legacy web device", undefined, "desktop"],
      ])(
        "%s: image ad keeps linkUrl null",
        async (_label, platform, device) => {
          const { service, advertisement } = makeService();
          liveAds(advertisement);
          const ads = await service.getActive(undefined, platform, device);
          expect(links(ads)).toEqual({
            img: null,
            bare: null,
            txt: "/kategori/x",
            blank: null,
          });
        },
      );
    });
  });
});

describe("AdvertisementService — yuvada tek reklam (slotTaken)", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  const expectSlotTaken = async (promise: Promise<unknown>, title: string) => {
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: { i18nKey: "server.ads.slotTaken", i18nParams: { title } },
    });
  };

  it("oluşturma: çakışan aktif reklam varsa 409, başlığıyla; yazılmaz", async () => {
    const { service, advertisement } = makeService();
    advertisement.findFirst.mockResolvedValue({ title: "Ekim Popup" });
    await expectSlotTaken(
      service.create({ title: "X", position: "popup", platform: "web" }),
      "Ekim Popup",
    );
    expect(advertisement.create).not.toHaveBeenCalled();
  });

  it("kontrol ve yazım tek işlemde, pozisyon kilidi kontrolden ÖNCE alınır", async () => {
    const { service, advertisement, $transaction, $executeRaw } = makeService(
      row({ position: "header" }),
    );
    await service.create({ title: "X", position: "popup", platform: "web" });
    expect($transaction).toHaveBeenCalledTimes(1);
    const [strings, key] = $executeRaw.mock.calls[0];
    expect((strings as string[]).join("?")).toContain("pg_advisory_xact_lock");
    expect(key).toBe("ad-slot:popup");
    expect($executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      advertisement.findFirst.mock.invocationCallOrder[0],
    );
    expect(advertisement.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      advertisement.create.mock.invocationCallOrder[0],
    );

    $executeRaw.mockClear();
    await service.update("ad-1", { position: "footer" });
    expect($executeRaw.mock.calls[0][1]).toBe("ad-slot:footer");
    expect($executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      advertisement.update.mock.invocationCallOrder[0],
    );
  });

  it("sorulacak bir şey yoksa (pasif) kilit de alınmaz", async () => {
    const { service, $executeRaw } = makeService();
    await service.create({ title: "Taslak", isActive: false });
    expect($executeRaw).not.toHaveBeenCalled();
  });

  it("oluşturma: sorgu yuvayı, çakışan platformları ve pencereyi taşır", async () => {
    const { service, advertisement } = makeService();
    await service.create({
      title: "X",
      position: "popup",
      platform: "web",
      startDate: "2026-11-01T00:00:00.000+03:00",
      endDate: "2026-11-30T23:59:59.999+03:00",
    });
    const { where } = advertisement.findFirst.mock.calls[0][0];
    expect(where).toMatchObject({
      position: "popup",
      isActive: true,
      platform: { in: ["web", "all"] },
    });
    expect(where).not.toHaveProperty("id");
    expect(where.AND).toEqual([
      {
        OR: [
          { endDate: null },
          { endDate: { gte: new Date("2026-10-31T21:00:00.000Z") } },
        ],
      },
      {
        OR: [
          { startDate: null },
          { startDate: { lte: new Date("2026-11-30T20:59:59.999Z") } },
        ],
      },
    ]);
    expect(advertisement.create).toHaveBeenCalled();
  });

  it("oluşturma: pasif reklam yuva kuralına takılmaz (sorgu yok)", async () => {
    const { service, advertisement } = makeService();
    advertisement.findFirst.mockResolvedValue({ title: "Dolu" });
    await service.create({
      title: "Taslak",
      position: "popup",
      isActive: false,
    });
    expect(advertisement.findFirst).not.toHaveBeenCalled();
    expect(advertisement.create).toHaveBeenCalled();
  });

  it("oluşturma: tamamen geçmişte kalan pencere kimseyi engellemez", async () => {
    const { service, advertisement } = makeService();
    advertisement.findFirst.mockResolvedValue({ title: "Dolu" });
    await service.create({
      title: "Eski",
      startDate: "2026-09-01T00:00:00.000+03:00",
      endDate: "2026-09-30T23:59:59.999+03:00",
    });
    expect(advertisement.findFirst).not.toHaveBeenCalled();
  });

  it("güncelleme: yuva değişirse sorulur, kendisi hariç; çakışma 409", async () => {
    const { service, advertisement } = makeService(row({ position: "header" }));
    advertisement.findFirst.mockResolvedValue({ title: "Başka" });
    await expectSlotTaken(
      service.update("ad-1", { position: "popup" }),
      "Başka",
    );
    expect(advertisement.findFirst.mock.calls[0][0].where).toMatchObject({
      id: { not: "ad-1" },
      position: "popup",
    });
    expect(advertisement.update).not.toHaveBeenCalled();
  });

  it("güncelleme: sonuç reklam üzerinden (saklı + yama) sorulur", async () => {
    const { service, advertisement } = makeService(
      row({ position: "popup", platform: "web", isActive: false }),
    );
    await service.update("ad-1", { isActive: true });
    expect(advertisement.findFirst.mock.calls[0][0].where).toMatchObject({
      position: "popup",
      platform: { in: ["web", "all"] },
    });
  });

  it("güncelleme: all'a geçen reklam iki platforma da bakar", async () => {
    const { service, advertisement } = makeService(row({ platform: "web" }));
    await service.update("ad-1", { platform: "all" });
    const { platform } = advertisement.findFirst.mock.calls[0][0].where;
    expect([...platform.in].sort()).toEqual(["all", "app", "web"]);
  });

  it("güncelleme: yuvayı belirleyen alan değişmediyse sorulmaz (eski çakışma düzeltilebilsin)", async () => {
    const { service, advertisement } = makeService();
    advertisement.findFirst.mockResolvedValue({ title: "Dolu" });
    await service.update("ad-1", {
      title: "Yeni başlık",
      position: "header",
      platform: "all",
      isActive: true,
      startDate: "2026-10-01T00:00:00+03:00",
    });
    expect(advertisement.findFirst).not.toHaveBeenCalled();
    expect(advertisement.update).toHaveBeenCalled();
  });

  it("güncelleme: gün sınırında olmayan eski tarih, aynı İstanbul gününe yuvarlanınca değişmiş sayılmaz", async () => {
    // Eski kayıt: 1 Kasım 14:30 İstanbul; form aynı günü 00:00 olarak yollar.
    const { service, advertisement } = makeService(
      row({
        startDate: new Date("2026-11-01T11:30:00.000Z"),
        endDate: new Date("2026-11-30T09:00:00.000Z"),
      }),
    );
    advertisement.findFirst.mockResolvedValue({ title: "Dolu" });
    await service.update("ad-1", {
      title: "Y",
      startDate: "2026-11-01T00:00:00.000+03:00",
      endDate: "2026-11-30T23:59:59.999+03:00",
    });
    expect(advertisement.findFirst).not.toHaveBeenCalled();
    expect(advertisement.update).toHaveBeenCalled();
  });

  it("güncelleme: farklı İstanbul gününe taşınan tarih sorulur", async () => {
    const { service, advertisement } = makeService(
      row({
        startDate: new Date("2026-11-01T11:30:00.000Z"),
        endDate: new Date("2026-11-30T09:00:00.000Z"),
      }),
    );
    await service.update("ad-1", {
      startDate: "2026-11-02T00:00:00.000+03:00",
    });
    expect(advertisement.findFirst).toHaveBeenCalled();
  });

  it("güncelleme: pasife alınan reklam sorulmaz", async () => {
    const { service, advertisement } = makeService();
    advertisement.findFirst.mockResolvedValue({ title: "Dolu" });
    await service.update("ad-1", { isActive: false });
    expect(advertisement.findFirst).not.toHaveBeenCalled();
  });

  it("sıralama (reorder) yuva kuralını sormaz", async () => {
    const { service, advertisement, $transaction } = makeService();
    // reorder dizi-işlem kullanır (etkileşimli değil).
    $transaction.mockImplementationOnce(async (ops: unknown) =>
      Promise.all(ops as Promise<unknown>[]),
    );
    await service.reorder(["ad-1", "ad-2"]);
    expect(advertisement.findFirst).not.toHaveBeenCalled();
  });
});

describe("AdvertisementService — platform ve popup sürümü yazımı", () => {
  it("oluşturma: deviceType kolonu platformdan türetilir", async () => {
    const { service, advertisement } = makeService();
    await service.create({ title: "X", platform: "app" });
    expect(advertisement.create.mock.calls[0][0].data).toMatchObject({
      platform: "app",
      deviceType: "mobile",
    });
  });

  it("güncelleme: platform değişince deviceType da türetilerek yazılır", async () => {
    const { service, advertisement } = makeService();
    await service.update("ad-1", {
      platform: "web",
      popupFrequency: "every_visit",
    });
    expect(updateData(advertisement)).toMatchObject({
      platform: "web",
      deviceType: "desktop",
      popupFrequency: "every_visit",
    });
  });

  it.each([
    ["başlık", { title: "Y" }],
    ["görsel", { imageUrl: "https://cdn.test/b.png" }],
    ["metin", { content: "yeni metin" }],
    ["alt metin", { altText: "yeni alt" }],
    ["sıklık", { popupFrequency: "every_visit" }],
  ] as const)("kreatif değişince (%s) popupVersion +1", async (_d, patch) => {
    const { service, advertisement } = makeService();
    await service.update("ad-1", patch as UpdateAdvertisementDto);
    expect(updateData(advertisement).popupVersion).toEqual({ increment: 1 });
  });

  it.each([
    ["anahtar", { isActive: false }],
    ["sıra", { displayOrder: 3 }],
    ["tarih", { endDate: "2026-12-31T23:59:59.999+03:00" }],
    ["platform", { platform: "web" }],
    ["yuva", { position: "footer" }],
    ["kampanya", { discountId: null }],
  ] as const)(
    "kreatif dışı değişiklik (%s) popupVersion'a dokunmaz",
    async (_d, patch) => {
      const { service, advertisement } = makeService();
      await service.update("ad-1", patch as UpdateAdvertisementDto);
      expect(updateData(advertisement).popupVersion).toBeUndefined();
    },
  );

  it("aynı değerleri yeniden yazmak (formun tam gönderimi) artırmaz", async () => {
    // Görselli reklam: bağlantı daima null (admin de null gönderir).
    const { service, advertisement } = makeService(row({ linkUrl: null }));
    await service.update("ad-1", {
      title: "Banner",
      imageUrl: "https://cdn.test/a.png",
      linkUrl: null,
      content: "metin",
      altText: "alt",
      popupFrequency: "until_dismissed",
      hotspots: [],
      isActive: true,
      displayOrder: 0,
    });
    expect(updateData(advertisement).popupVersion).toBeUndefined();
  });

  it("aynı alan kümesi (id + geometri + etiket + bağlantı) artırmaz; farklı geometri artırır", async () => {
    const payload = {
      id: "11111111-1111-4111-8111-111111111111",
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
      label: "Sol",
      linkUrl: "/sol",
    };
    const stored = { ...payload, sortOrder: 0 };
    const same = makeService(row({ linkUrl: null, hotspots: [stored] }));
    await same.service.update("ad-1", {
      hotspots: [{ ...payload, label: " Sol " }],
    });
    expect(updateData(same.advertisement).popupVersion).toBeUndefined();

    const moved = makeService(row({ linkUrl: null, hotspots: [stored] }));
    await moved.service.update("ad-1", {
      hotspots: [{ ...payload, x: 0.5 }],
    });
    expect(updateData(moved.advertisement).popupVersion).toEqual({
      increment: 1,
    });
  });

  it("oluşturma popupVersion yazmaz (şema varsayılanı 1)", async () => {
    const { service, advertisement } = makeService();
    await service.create({ title: "X" });
    expect(advertisement.create.mock.calls[0][0].data).not.toHaveProperty(
      "popupVersion",
    );
  });

  it("admin yanıtı platform, sıklık ve sürümü taşır", async () => {
    const { service } = makeService(
      row({ platform: "web", popupFrequency: "every_visit", popupVersion: 3 }),
    );
    expect(await service.findOne("ad-1")).toMatchObject({
      platform: "web",
      deviceType: "desktop",
      popupFrequency: "every_visit",
      popupVersion: 3,
    });
  });

  it("istatistik platform başına gruplanır", async () => {
    const { service, advertisement } = makeService();
    advertisement.findMany.mockResolvedValue([
      row({ platform: "web", clickCount: 2, impressionCount: 10 }),
      row({ id: "ad-2", platform: "web", clickCount: 1, impressionCount: 5 }),
      row({ id: "ad-3", platform: "app" }),
    ]);
    const stats = await service.getStatistics();
    expect(stats.byPlatform).toEqual({
      web: { count: 2, clicks: 3, impressions: 15 },
      app: { count: 1, clicks: 0, impressions: 0 },
    });
    expect(stats).not.toHaveProperty("byDeviceType");
  });
});
