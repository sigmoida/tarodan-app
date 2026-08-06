import { BadRequestException } from "@nestjs/common";
import { DiscountScope, DiscountType } from "@prisma/client";
import { DiscountService } from "./discount.service";
import { DiscountScopeService } from "./discount-scope.service";
import { testPriceResolver } from "./testing/price-resolver-fixture";

describe("DiscountService yapılandırma kuralları", () => {
  const created = jest.fn();

  const makeService = () => {
    const prisma = {
      discount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: created.mockImplementation(async ({ data }: any) => ({
          ...data,
          id: "discount-1",
          usedCount: 0,
          targetProductIds: data.targetProductIds ?? [],
        })),
      },
      category: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    return new DiscountService(
      prisma,
      { delPattern: jest.fn() } as any,
      { syncProduct: jest.fn() } as any,
      testPriceResolver(),
      new DiscountScopeService(prisma),
    );
  };

  const baseDto = {
    name: "Kampanya",
    type: DiscountType.fixed_amount,
    value: 10,
    scope: DiscountScope.global,
    startDate: "2026-01-01T00:00:00Z",
    endDate: "2026-12-31T23:59:59Z",
  } as any;

  beforeEach(() => jest.clearAllMocks());

  /**
   * "İndirimdekiler" filtresi ve ana sayfa kampanya listesi de fiyat
   * çözümleyiciyle AYNI otomatik-kampanya tanımını kullanmalı; aksi halde
   * toplu voucher şablonunun kapsadığı ürünler indirimli gibi listelenirdi.
   */
  describe("otomatik kampanya tanımı (toplu voucher şablonu hariç)", () => {
    const makeCriteriaService = (rows: any[]) => {
      const prisma = {
        discount: {
          findMany: async ({ where }: any = {}) =>
            rows.filter((row) => {
              if (where?.code === null && row.code != null) return false;
              if (where?.isBatch === false && row.isBatch === true)
                return false;
              return true;
            }),
        },
        category: { findMany: async () => [] },
      } as any;
      return new DiscountService(
        prisma,
        { delPattern: jest.fn() } as any,
        { syncProduct: jest.fn() } as any,
        testPriceResolver(),
        new DiscountScopeService(prisma),
      );
    };

    const row = (overrides: Record<string, unknown>) => ({
      scope: DiscountScope.seller,
      sellerId: "seller-1",
      categoryId: null,
      targetProductIds: [],
      code: null,
      isBatch: false,
      ...overrides,
    });

    it("toplu voucher şablonu indirim ölçütlerine girmez", async () => {
      const criteria = await makeCriteriaService([
        row({ isBatch: true, sellerId: "seller-batch" }),
      ]).getActiveDiscountCriteria();

      expect(criteria.sellerIds).toEqual([]);
      expect(criteria.hasGlobal).toBe(false);
    });

    it("normal otomatik kampanya ölçütlere girmeye devam eder", async () => {
      const criteria = await makeCriteriaService([
        row({ sellerId: "seller-1" }),
      ]).getActiveDiscountCriteria();

      expect(criteria.sellerIds).toEqual(["seller-1"]);
    });

    it("ana sayfa kampanya listesi de şablonu göstermez", async () => {
      const campaigns = await makeCriteriaService([
        row({
          id: "batch",
          name: "Hediye",
          scope: DiscountScope.global,
          sellerId: null,
          isBatch: true,
          type: DiscountType.fixed_amount,
          value: 10,
          endDate: new Date(),
        }),
      ]).getActiveCampaigns();

      expect(campaigns).toEqual([]);
    });
  });

  describe("değer aralığı", () => {
    it("yüzde indirim %100'ü aşamaz", async () => {
      await expect(
        makeService().create(
          { ...baseDto, type: DiscountType.percentage, value: 150 },
          null,
          true,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("sabit tutarlı indirimde 100 üstü değer serbesttir", async () => {
      await expect(
        makeService().create({ ...baseDto, value: 500 }, null, true),
      ).resolves.toBeDefined();
    });
  });

  describe("tarih aralığı", () => {
    it("bitiş başlangıçtan önceyse reddedilir", async () => {
      await expect(
        makeService().create(
          {
            ...baseDto,
            startDate: "2026-12-01T00:00:00Z",
            endDate: "2026-01-01T00:00:00Z",
          },
          null,
          true,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("kişi başı kullanım limiti", () => {
    /**
     * Regresyon: alan `|| 1` ile yazıldığı için SINIRSIZ bir kupon
     * tanımlanamıyordu. Her kuponda limit dolu olduğundan validateCoupon
     * kimlik istiyor ve misafir hiçbir kuponu kullanamıyordu.
     */
    it("0 gönderilince sınırsız (null) kaydedilir", async () => {
      await makeService().create(
        { ...baseDto, code: "GUEST10", usageLimitPerUser: 0 },
        null,
        true,
      );

      expect(created).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ usageLimitPerUser: null }),
        }),
      );
    });

    it("hiç verilmezse varsayılan 1 korunur", async () => {
      await makeService().create({ ...baseDto, code: "ONCE" }, null, true);

      expect(created).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ usageLimitPerUser: 1 }),
        }),
      );
    });

    it("verilen limit olduğu gibi kaydedilir", async () => {
      await makeService().create(
        { ...baseDto, code: "TWICE", usageLimitPerUser: 2 },
        null,
        true,
      );

      expect(created).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ usageLimitPerUser: 2 }),
        }),
      );
    });
  });
});
