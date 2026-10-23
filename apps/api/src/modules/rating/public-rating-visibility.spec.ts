import { NotFoundException } from "@nestjs/common";
import { RatingStatus } from "@prisma/client";
import { RATING_STATUSES } from "@tarodan/types";
import { RatingService } from "./rating.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";
import { ProductCommonService } from "../product/product-common.service";
import {
  isPublicRatingStatus,
  publicProductRatingWhere,
  publicUserRatingWhere,
} from "../../common/helpers/public-rating";

/**
 * Onaysız yorum hiçbir herkese açık yüzeyde SAYILMAZ.
 *
 * Regresyon: ürün kartlarında yorum sayısı görünüyor ama ürün detayında yorum
 * yok, admin panelinde de o yorumlar onaylı değildi. Kart sayacı hiç
 * ProductRating okumaz — Product.averageRating/ratingCount cache kolonlarından
 * beslenir; o kolonları yazan taraf filtreyi atlarsa "hayalet yorum" doğar.
 * Bu testler filtreyi hem yazma hem okuma yolunda sabitler.
 */
describe("yayınlanmış puan görünürlüğü — yalnız approved", () => {
  describe("RatingService.updateProductRatingStats (cache kolonlarını yazan taraf)", () => {
    const makeService = () => {
      const prisma = {
        productRating: {
          aggregate: jest
            .fn()
            .mockResolvedValue({ _avg: { score: 4.5 }, _count: 2 }),
        },
        product: { update: jest.fn().mockResolvedValue({}) },
      };
      const service = new RatingService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        { isEnabled: false } as any,
        userBlockServiceStub() as any,
      );
      return { service, prisma };
    };

    it("ortalamayı ve sayıyı yalnız approved satırlardan toplar", async () => {
      const { service, prisma } = makeService();

      await service.updateProductRatingStats("p1");

      expect(prisma.productRating.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: "p1", status: "approved" },
        }),
      );
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "p1" },
          data: { averageRating: 4.5, ratingCount: 2 },
        }),
      );
    });

    it("son onaylı yorum kalkınca ortalamayı NULL'a, sayacı 0'a çeker", async () => {
      const { service, prisma } = makeService();
      prisma.productRating.aggregate.mockResolvedValue({
        _avg: { score: null },
        _count: 0,
      });

      await service.updateProductRatingStats("p1");

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { averageRating: null, ratingCount: 0 },
        }),
      );
    });
  });

  describe("RatingService.getProductRatings / getProductRatingStats (okuma yolu)", () => {
    const makeService = () => {
      const prisma = {
        productRating: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new RatingService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        { isEnabled: false } as any,
        userBlockServiceStub() as any,
      );
      return { service, prisma };
    };

    it("yorum listesi onaysız satırları çekmez", async () => {
      const { service, prisma } = makeService();

      await service.getProductRatings("p1", 1, 20);

      for (const call of [
        prisma.productRating.findMany.mock.calls[0][0],
        prisma.productRating.count.mock.calls[0][0],
      ]) {
        expect(call.where).toEqual(
          expect.objectContaining({ productId: "p1", status: "approved" }),
        );
      }
    });

    it("puan dağılımı (histogram) onaysız satırları saymaz", async () => {
      const { service, prisma } = makeService();

      await service.getProductRatingStats("p1");

      expect(prisma.productRating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: "p1", status: "approved" },
        }),
      );
    });
  });

  describe("ProductCommonService — kart yanıtı", () => {
    const makeService = (groupByRows: any[] = []) => {
      const prisma = {
        product: { groupBy: jest.fn().mockResolvedValue([]) },
        order: { groupBy: jest.fn().mockResolvedValue([]) },
        rating: { groupBy: jest.fn().mockResolvedValue([]) },
        userMembership: { findMany: jest.fn().mockResolvedValue([]) },
        productRating: {
          groupBy: jest.fn().mockResolvedValue(groupByRows),
        },
        setting: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const discountService = {
        getEffectiveDisplayPriceMany: jest.fn().mockResolvedValue(new Map()),
      };
      const storageService = {
        getPublicAssetUrl: (k: string) => `https://cdn/${k}`,
        getPresignedDownloadUrl: jest.fn(),
      };
      const service = new ProductCommonService(
        prisma as any,
        discountService as any,
        storageService as any,
      );
      return { service, prisma };
    };

    const baseProduct = {
      id: "p1",
      title: "Ürün",
      price: 100,
      images: [],
      averageRating: null,
      ratingCount: null,
    };

    it("cache kolonu yokken toplamayı approved filtresiyle yapar", async () => {
      const { service, prisma } = makeService([
        { productId: "p1", _avg: { score: 4 }, _count: 3 },
      ]);

      const [formatted] = await service.formatProductResponseMany([
        { ...baseProduct },
      ]);

      expect(prisma.productRating.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: { in: ["p1"] }, status: "approved" },
        }),
      );
      expect(formatted.rating).toEqual({ average: 4, count: 3 });
    });

    it("onaylı yorumu olmayan ürün kartında sayaç 0 / ortalama null kalır", async () => {
      const { service } = makeService([]);

      const [formatted] = await service.formatProductResponseMany([
        { ...baseProduct },
      ]);

      expect(formatted.rating).toEqual({ average: null, count: 0 });
    });
  });

  describe("publicProductRatingWhere", () => {
    it("çağıranın gönderdiği status'u ezer — public yolda onaysız satır sızamaz", () => {
      expect(
        publicProductRatingWhere({ productId: "p1", status: "pending" }),
      ).toEqual({ productId: "p1", status: "approved" });
    });
  });

  describe("hidden (admin moderation) is non-public like every non-approved status", () => {
    it("only approved is public; hidden and the legacy statuses are not", () => {
      for (const status of Object.values(RatingStatus)) {
        expect([status, isPublicRatingStatus(status)]).toEqual([
          status,
          status === RatingStatus.approved,
        ]);
      }
    });

    it("the shared status list (@tarodan/types) matches the database enum", () => {
      expect([...RATING_STATUSES].sort()).toEqual(
        Object.values(RatingStatus).sort(),
      );
    });

    it("the public filters override a caller's hidden status", () => {
      expect(
        publicProductRatingWhere({ productId: "p1", status: "hidden" }),
      ).toEqual({ productId: "p1", status: "approved" });
      expect(
        publicUserRatingWhere({ receiverId: "u1", status: "hidden" }),
      ).toEqual({ receiverId: "u1", status: "approved" });
    });
  });

  describe("RatingService user ratings (seller profile list and stats)", () => {
    const makeService = () => {
      const prisma = {
        rating: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new RatingService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        { isEnabled: false } as never,
        userBlockServiceStub() as never,
      );
      return { service, prisma };
    };

    it("the list and its total read only published ratings", async () => {
      const { service, prisma } = makeService();

      await service.getUserRatings("seller-1", 1, 20);

      for (const call of [
        prisma.rating.findMany.mock.calls[0][0],
        prisma.rating.count.mock.calls[0][0],
      ]) {
        expect(call.where).toEqual(
          expect.objectContaining({
            receiverId: "seller-1",
            status: "approved",
          }),
        );
      }
    });

    it("the average and distribution read only published ratings", async () => {
      const { service, prisma } = makeService();

      await service.getUserRatingStats("seller-1");

      expect(prisma.rating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { receiverId: "seller-1", status: "approved" },
        }),
      );
    });
  });

  describe("RatingService.markProductRatingHelpful", () => {
    it("a hidden review is not found and its counter does not move", async () => {
      const prisma = {
        productRating: {
          findUnique: jest.fn().mockResolvedValue({ status: "hidden" }),
          update: jest.fn(),
        },
      };
      const service = new RatingService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        { isEnabled: false } as never,
        userBlockServiceStub() as never,
      );

      await expect(
        service.markProductRatingHelpful("pr-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.productRating.update).not.toHaveBeenCalled();
    });
  });

  describe("ProductCommonService seller block (product detail and lists)", () => {
    it("aggregates the seller's rating from published ratings only", async () => {
      const prisma = {
        product: { groupBy: jest.fn().mockResolvedValue([]) },
        order: { groupBy: jest.fn().mockResolvedValue([]) },
        rating: { groupBy: jest.fn().mockResolvedValue([]) },
        userMembership: { findMany: jest.fn().mockResolvedValue([]) },
        productRating: { groupBy: jest.fn().mockResolvedValue([]) },
        setting: { findUnique: jest.fn().mockResolvedValue(null) },
        membershipTier: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new ProductCommonService(
        prisma as never,
        {
          getEffectiveDisplayPriceMany: jest.fn().mockResolvedValue(new Map()),
        } as never,
        {
          getPublicAssetUrl: (k: string) => `https://cdn/${k}`,
          getPresignedDownloadUrl: jest.fn(),
        } as never,
      );

      await service.formatProductResponseMany([
        {
          id: "p1",
          title: "Model",
          price: 100,
          images: [],
          averageRating: 4,
          ratingCount: 1,
          seller: { id: "seller-1" },
        },
      ]);

      expect(prisma.rating.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { receiverId: { in: ["seller-1"] }, status: "approved" },
        }),
      );
    });
  });
});
