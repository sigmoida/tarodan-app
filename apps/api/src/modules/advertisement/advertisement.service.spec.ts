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
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

function makeService(existing: Record<string, unknown> | null = row()) {
  const advertisement = {
    findUnique: jest.fn().mockResolvedValue(existing),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
      row(data),
    ),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
      row({ ...existing, ...data }),
    ),
    delete: jest.fn(),
  };
  const discount = {
    findUnique: jest.fn().mockResolvedValue({ id: "disc-1" }),
  };
  const prisma = { advertisement, discount } as unknown as PrismaService;
  const media = {
    upload: jest.fn().mockResolvedValue({ url: "https://cdn.test/ads/a.webp" }),
  };
  return {
    service: new AdvertisementService(prisma, media as unknown as MediaService),
    advertisement,
    discount,
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
    const { service, advertisement } = makeService();
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
    expect(advertisement.create.mock.calls[0][0].include).toBeDefined();

    await service.update("ad-1", { title: "Y" });
    expect(advertisement.update.mock.calls[0][0].include).toBeDefined();
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
