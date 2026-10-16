import { RatingService } from "./rating.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";

/**
 * S9b — Apple 1.2: engellenen kullanıcının yorumları ve değerlendirmeleri
 * engelleyene SUNUCUDA süzülür. Eskiden yalnız istemci gizliyordu; liste
 * uçları engel ilişkisini hiç okumuyordu.
 */
describe("RatingService — engellenen kullanıcının yorumları", () => {
  const makeService = (hidden: string[] = []) => {
    const prisma = {
      rating: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      productRating: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const userBlocks = userBlockServiceStub({ hidden });
    const service = new RatingService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      { isEnabled: false } as any,
      userBlocks as any,
    );
    return { service, prisma, userBlocks };
  };

  it("satıcı değerlendirmeleri: gizli kullanıcıların verdiği puanlar listelenmez ve sayılmaz", async () => {
    const { service, prisma, userBlocks } = makeService(["blocked-1"]);

    await service.getUserRatings("seller-1", 1, 20, "viewer-1");

    expect(userBlocks.getHiddenUserIds).toHaveBeenCalledWith("viewer-1");
    for (const call of [
      prisma.rating.findMany.mock.calls[0][0],
      prisma.rating.count.mock.calls[0][0],
    ]) {
      expect(call.where).toEqual({
        receiverId: "seller-1",
        giverId: { notIn: ["blocked-1"] },
        status: "approved",
      });
    }
  });

  it("ürün yorumları: gizli kullanıcıların yorumları listelenmez ve sayılmaz", async () => {
    const { service, prisma } = makeService(["blocked-1"]);

    await service.getProductRatings(
      "p1",
      1,
      20,
      undefined,
      undefined,
      "viewer-1",
    );

    for (const call of [
      prisma.productRating.findMany.mock.calls[0][0],
      prisma.productRating.count.mock.calls[0][0],
    ]) {
      expect(call.where).toEqual({
        productId: "p1",
        userId: { notIn: ["blocked-1"] },
        status: "approved",
      });
    }
  });

  it("puan filtresi gizli kullanıcı süzgeciyle birlikte çalışır", async () => {
    const { service, prisma } = makeService(["blocked-1"]);

    await service.getProductRatings("p1", 1, 20, "highest", 5, "viewer-1");

    expect(prisma.productRating.findMany.mock.calls[0][0].where).toEqual({
      productId: "p1",
      userId: { notIn: ["blocked-1"] },
      status: "approved",
      score: 5,
    });
  });

  it("anonim viewer ve engeli olmayan viewer için filtre eklenmez", async () => {
    const { service, prisma } = makeService([]);

    await service.getUserRatings("seller-1", 1, 20);

    expect(prisma.rating.findMany.mock.calls[0][0].where.giverId).toBe(
      undefined,
    );
  });
});
