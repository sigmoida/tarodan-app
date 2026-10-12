import { BadRequestException } from "@nestjs/common";
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
  deviceType: "all",
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
  const mock: Record<string, unknown> = { advertisement, discount, adHotspot };
  // İnteraktif işlem aynı istemciyle çalışır: tx üzerindeki çağrılar aynı
  // mock'lara düşer.
  const $transaction = jest.fn(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(mock),
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
      "deviceType",
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

describe("AdvertisementService.create — varsayılanlar", () => {
  it("yuva/cihaz/sıra/anahtar gönderilmezse header/all/0/true", async () => {
    const { service, advertisement } = makeService();
    await service.create({ title: "X" });
    expect(advertisement.create.mock.calls[0][0].data).toMatchObject({
      position: "header",
      deviceType: "all",
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
    await service.getActive("topbar", "mobile");
    const args = advertisement.findMany.mock.calls[0][0];
    expect(args.where.position).toBe("topbar");
    expect(args.where.deviceType).toEqual({ in: ["mobile", "all"] });
    expect(args.orderBy).toEqual([
      { displayOrder: "asc" },
      { createdAt: "desc" },
    ]);
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
    advertisement.findMany.mockResolvedValue([
      row({ id: "a", discount: null }),
      row({ id: "b", discount: liveCampaign }),
      row({
        id: "c",
        discount: { ...liveCampaign, endDate: new Date("2026-10-02T00:00:00Z") },
      }),
    ]);

    const ads = await service.getActive("header");

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
    expect(AD_IMAGE_UPLOAD).toMatchObject({ bucket: "products", folder: "ads" });
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

  const left = { x: 0, y: 0, width: 0.5, height: 1, label: "Sol", linkUrl: "/sol" };
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

      const [ad] = await service.getActive("header");

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
  });
});
