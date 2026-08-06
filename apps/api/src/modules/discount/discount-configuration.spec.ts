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
