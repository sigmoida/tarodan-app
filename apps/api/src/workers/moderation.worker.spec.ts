import { ProductStatus } from "@prisma/client";
import { ModerationWorker } from "./moderation.worker";

describe("ModerationWorker direct-approved imports", () => {
  it("withdraws an active bulk-import product when async moderation flags it", async () => {
    const prisma = {
      product: {
        update: jest.fn().mockResolvedValue({ sellerId: "seller-1" }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const storage = {
      getPublicAssetUrl: jest.fn().mockReturnValue("https://cdn/image.webp"),
    };
    const ai = {
      isEnabled: true,
      moderateImage: jest.fn().mockResolvedValue({
        relevanceScore: 0.9,
        nsfwScore: 0.95,
        topLabels: [],
        decision: "flag",
        reason: "nsfw",
      }),
      recordEvent: jest.fn().mockResolvedValue(undefined),
    };
    const search = {
      syncProduct: jest.fn().mockResolvedValue(undefined),
    };
    const cache = {
      delPattern: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new ModerationWorker(
      prisma as never,
      storage as never,
      ai as never,
      search as never,
      cache as never,
    );

    await worker.handleProductImage({
      data: {
        productId: "product-1",
        imageKeys: ["image.webp"],
        directApproval: true,
      },
    } as never);

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: "product-1", status: ProductStatus.active },
      data: { status: ProductStatus.pending },
    });
    expect(search.syncProduct).toHaveBeenCalledWith("product-1");
    expect(cache.delPattern).toHaveBeenCalledWith("products:list:*");
  });
});
