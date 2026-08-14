import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  MembershipTierType,
  Prisma,
  ProductStatus,
  SubscriptionStatus,
} from "@prisma/client";
import * as ExcelJS from "exceljs";
import { AdminProductBulkImportService } from "./admin-product-bulk-import.service";

jest.mock("../../../common/helpers/revalidate", () => ({
  notifyWebRevalidate: jest.fn().mockResolvedValue(undefined),
}));

const IDS = {
  seller: "6f8f30af-3e70-42ef-9d79-6ce3e1498521",
  category: "aa9f7937-1607-4fca-a67b-288e02a0d22a",
  brand: "85defe79-172d-4979-aac3-b5100e156ba0",
  model: "2d69a09e-9023-477e-8324-79ad0dff2e70",
  manufacturer: "12d1dad5-8eba-4620-913e-d13217524ffc",
  scale: "eb773ddd-163b-43fd-b896-d229b9f53d47",
  material: "a8751828-14fc-41c6-ae58-30ad7e7382b1",
  batch: "944aa269-fb61-4dfe-96ce-e4af4ff5ba45",
};

const HEADERS = [
  "urun_ref",
  "baslik",
  "aciklama",
  "kategori",
  "marka",
  "arac_modeli",
  "uretici",
  "model_kodu",
  "durum",
  "renk",
  "olcek",
  "malzeme",
  "kutulu",
  "fiyat",
  "stok",
  "kargo_paketi",
  "gorsel_1",
  "gorsel_2",
  "gorsel_3",
  "indirimli_fiyat",
];

async function workbookFile(
  salePrice?: number,
  optionalModel: { carModel?: string | null; modelCode?: string | null } = {},
): Promise<Express.Multer.File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Urunler");
  sheet.addRow(HEADERS);
  sheet.addRow([
    "URUN-001",
    "Hot Wheels Dodge Challenger 1:64",
    "Koleksiyon için uygun, kutulu ve ayrıntılı model araba ürünüdür.",
    "Araba",
    "Dodge",
    optionalModel.carModel === undefined
      ? "Challenger R/T"
      : optionalModel.carModel,
    "Hot Wheels",
    optionalModel.modelCode === undefined ? "HW-001" : optionalModel.modelCode,
    "new",
    "Mor",
    "1:64",
    "diecast",
    "Evet",
    899,
    3,
    "small",
    "front.jpg",
    "back.jpg",
    "box.jpg",
    salePrice,
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    fieldname: "workbook",
    originalname: "urunler.xlsx",
    encoding: "7bit",
    mimetype:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: buffer.byteLength,
    buffer: Buffer.from(buffer),
    destination: "",
    filename: "",
    path: "",
    stream: null as never,
  };
}

function imageFile(name: string): Express.Multer.File {
  const buffer = Buffer.from("image");
  return {
    fieldname: "images",
    originalname: name,
    encoding: "7bit",
    mimetype: "image/jpeg",
    size: buffer.length,
    buffer,
    destination: "",
    filename: "",
    path: "",
    stream: null as never,
  };
}

describe("AdminProductBulkImportService", () => {
  const images = [
    imageFile("front.jpg"),
    imageFile("back.jpg"),
    imageFile("box.jpg"),
  ];

  function setup() {
    const tx = {
      product: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: data.id,
          productCode: "U010001",
          title: data.title,
          status: data.status,
        })),
      },
      productImportBatch: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: IDS.seller,
          displayName: "Kurumsal Satıcı",
          companyName: "Model Otomotiv A.Ş.",
          taxId: "1234567890",
          businessStatus: "approved",
          isSeller: true,
          isBanned: false,
          sellerType: "verified",
          membership: {
            status: SubscriptionStatus.active,
            currentPeriodEnd: new Date("2099-01-01"),
            tier: {
              type: MembershipTierType.business,
              isActive: true,
              maxImagesPerListing: 10,
            },
          },
        }),
      },
      category: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: IDS.category, name: "Araba", slug: "araba" },
          ]),
      },
      brand: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: IDS.brand, name: "Dodge", slug: "dodge" }]),
      },
      carModel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: IDS.model,
            name: "Challenger R/T",
            slug: "challenger-rt",
            brandId: IDS.brand,
          },
        ]),
      },
      manufacturer: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: IDS.manufacturer,
            name: "Hot Wheels",
            slug: "hot-wheels",
          },
        ]),
      },
      attribute: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: IDS.scale,
            slug: "1-64",
            value: "1:64",
            displayValue: "1:64",
            group: { slug: "scale" },
          },
          {
            id: IDS.material,
            slug: "diecast",
            value: "diecast",
            displayValue: "Diecast",
            group: { slug: "material" },
          },
        ]),
      },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      productImportBatch: {
        create: jest.fn().mockResolvedValue(undefined),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const media = {
      uploadProductImageVariants: jest
        .fn()
        .mockImplementation((_file, productId) => ({
          cardKey: `products/${productId}/card.webp`,
          detailKey: `products/${productId}/detail.webp`,
        })),
    };
    const storage = { deleteFileByKey: jest.fn() };
    const membership = {
      getUserLimits: jest.fn().mockResolvedValue({
        remainingTotalListings: -1,
        maxImages: 10,
      }),
    };
    const commissionGuard = { assertListingRuleExists: jest.fn() };
    const search = { syncProduct: jest.fn().mockResolvedValue(undefined) };
    const cache = { delPattern: jest.fn().mockResolvedValue(undefined) };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const moderationAi = {
      assertTextClean: jest.fn().mockResolvedValue(undefined),
      assertImageClean: jest.fn().mockResolvedValue(undefined),
    };
    const moderationQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const common = {
      resolveProductAttributeIds: jest
        .fn()
        .mockResolvedValue([IDS.scale, IDS.material]),
    };
    const ranking = {
      recomputeProductRanking: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminProductBulkImportService(
      prisma as never,
      media as never,
      storage as never,
      membership as never,
      commissionGuard as never,
      search as never,
      cache as never,
      audit as never,
      moderationAi as never,
      moderationQueue as never,
      common as never,
      ranking as never,
    );
    return {
      service,
      prisma,
      tx,
      media,
      storage,
      commissionGuard,
      moderationAi,
      moderationQueue,
      common,
      ranking,
    };
  }

  it("publishes every valid row as an active non-trade listing", async () => {
    const {
      service,
      tx,
      media,
      storage,
      commissionGuard,
      moderationAi,
      moderationQueue,
      common,
      ranking,
    } = setup();

    const result = await service.import(
      "admin-1",
      IDS.seller,
      IDS.batch,
      await workbookFile(),
      images,
    );
    if (result.status !== "completed") {
      throw new Error("Expected completed import");
    }

    expect(result.createdCount).toBe(1);
    expect(result.products[0]).toEqual(
      expect.objectContaining({
        reference: "URUN-001",
        status: ProductStatus.active,
      }),
    );
    expect(tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sellerId: IDS.seller,
          status: ProductStatus.active,
          isTradeEnabled: false,
          images: { create: expect.any(Array) },
        }),
      }),
    );
    expect(media.uploadProductImageVariants).toHaveBeenCalledTimes(3);
    expect(moderationAi.assertTextClean).toHaveBeenCalledTimes(2);
    expect(moderationAi.assertImageClean).toHaveBeenCalledTimes(3);
    expect(common.resolveProductAttributeIds).toHaveBeenCalledWith(
      "1:64",
      undefined,
      "diecast",
      [],
      { rejectUnknown: true },
    );
    expect(ranking.recomputeProductRanking).toHaveBeenCalledTimes(1);
    expect(moderationQueue.add).toHaveBeenCalledWith(
      "product-image",
      expect.objectContaining({ productId: result.products[0].id }),
    );
    expect(commissionGuard.assertListingRuleExists).toHaveBeenCalledWith({
      sellerId: IDS.seller,
      categoryId: IDS.category,
      amount: 899,
    });
    expect(storage.deleteFileByKey).not.toHaveBeenCalled();
    expect(tx.productImportBatch.update).toHaveBeenCalledWith({
      where: { id: IDS.batch },
      data: expect.objectContaining({
        status: "completed",
        result: expect.objectContaining({
          batchId: IDS.batch,
          createdCount: 1,
        }),
      }),
    });
  });

  it("accepts bulk-import rows without car model and model code", async () => {
    const { service, tx } = setup();

    await service.import(
      "admin-1",
      IDS.seller,
      IDS.batch,
      await workbookFile(undefined, { carModel: null, modelCode: null }),
      images,
    );

    expect(tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          carModelId: undefined,
          modelCode: undefined,
        }),
      }),
    );
  });

  it("rejects an invalid discount before uploading images", async () => {
    const { service, media, prisma } = setup();

    let thrown: unknown;
    try {
      await service.import(
        "admin-1",
        IDS.seller,
        IDS.batch,
        await workbookFile(999),
        images,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as BadRequestException).getResponse()).toEqual(
      expect.objectContaining({
        code: "PRODUCT_BULK_IMPORT_VALIDATION_FAILED",
        errors: [expect.stringContaining("indirimli_fiyat")],
      }),
    );
    expect(media.uploadProductImageVariants).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns the completed batch instead of creating duplicate products", async () => {
    const { service, prisma, media } = setup();
    const workbook = await workbookFile();
    const retryImages = [
      imageFile("front.jpg"),
      imageFile("back.jpg"),
      imageFile("box.jpg"),
    ];
    const requestFingerprint = (service as any).importFingerprint(
      IDS.seller,
      workbook,
      retryImages,
    );
    const completed = {
      success: true,
      status: "completed",
      batchId: IDS.batch,
      seller: {
        id: IDS.seller,
        displayName: "Kurumsal Satıcı",
        companyName: "Model Otomotiv A.Ş.",
      },
      createdCount: 1,
      products: [],
    };
    prisma.productImportBatch.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "5.22.0",
      }),
    );
    prisma.productImportBatch.findFirst.mockResolvedValueOnce({
      id: IDS.batch,
      adminId: "admin-1",
      sellerId: IDS.seller,
      sourceFilename: workbook.originalname,
      requestFingerprint,
      status: "completed",
      result: completed,
      errorMessages: [],
    });

    await expect(
      service.import("admin-1", IDS.seller, IDS.batch, workbook, retryImages),
    ).resolves.toEqual(completed);
    expect(media.uploadProductImageVariants).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("preserves a platform commission coverage error as HTTP 409", async () => {
    const { service, commissionGuard, media } = setup();
    commissionGuard.assertListingRuleExists.mockRejectedValueOnce(
      new ConflictException({
        code: "LISTING_COMMISSION_RULE_UNAVAILABLE",
        message: "Komisyon kuralı bulunamadı.",
      }),
    );

    await expect(
      service.import(
        "admin-1",
        IDS.seller,
        IDS.batch,
        await workbookFile(),
        images.map((file) => ({ ...file, buffer: Buffer.from("image") })),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(media.uploadProductImageVariants).not.toHaveBeenCalled();
  });

  it("closes a batch left processing by a dead import process", async () => {
    const { service, prisma } = setup();
    const stale = {
      id: IDS.batch,
      adminId: "admin-1",
      status: "processing",
      result: null,
      errorMessages: [],
      createdAt: new Date(Date.now() - 45 * 60 * 1000),
    };
    prisma.productImportBatch.findFirst.mockResolvedValueOnce(stale);
    prisma.productImportBatch.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.productImportBatch.findUnique.mockResolvedValueOnce({
      ...stale,
      status: "failed",
      errorMessages: ["Yükleme yarıda kaldı"],
    });

    await expect(service.getBatch("admin-1", IDS.batch)).resolves.toEqual({
      success: false,
      status: "failed",
      batchId: IDS.batch,
      errors: ["Yükleme yarıda kaldı"],
    });
    expect(prisma.productImportBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: IDS.batch, status: "processing" },
      }),
    );
  });

  it("keeps polling a batch that is still within the stale window", async () => {
    const { service, prisma } = setup();
    prisma.productImportBatch.findFirst.mockResolvedValueOnce({
      id: IDS.batch,
      adminId: "admin-1",
      status: "processing",
      result: null,
      errorMessages: [],
      createdAt: new Date(Date.now() - 60 * 1000),
    });

    await expect(service.getBatch("admin-1", IDS.batch)).resolves.toMatchObject(
      { status: "processing" },
    );
    expect(prisma.productImportBatch.updateMany).not.toHaveBeenCalled();
  });
});
