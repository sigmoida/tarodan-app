import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { findUniqueShaping } from "../../prisma/prisma-row-shape.testing";
import { userBlockServiceStub } from "../user-block/user-block.testing";
import type { CreateProductRatingDto, CreateUserRatingDto } from "./dto";
import { RatingService } from "./rating.service";

/**
 * Platform-service orders (membership `MEM-`, boost `BST-`) are orders on a
 * virtual product (`membership-<tierId>`, `boost-<boostId>`) sold by the
 * platform account. Neither the product nor the seller of such an order can
 * be rated. The guard reads the virtual product id and runs before the
 * product-specific checks. A completed boost order used to pass because only
 * the `MEM-` order number was checked. The order lookup is shaped by its
 * query arguments, so the guard fails here if the query stops selecting
 * `productId` (a missing id would read as a listing and let the rating in).
 */
describe("RatingService platform-service order guard", () => {
  const makeService = (order: object) => {
    const prisma = {
      order: { findUnique: findUniqueShaping(order) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: "r1" }) },
    };
    return new RatingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { isEnabled: false } as never,
      userBlockServiceStub() as never,
    );
  };

  const membershipOrder = {
    id: "o1",
    orderNumber: "MEM-1781257318265-BENIPST9F",
    buyerId: "b1",
    sellerId: "r1",
    productId: "membership-tier-premium",
    status: "completed",
  };
  const boostOrder = {
    id: "o2",
    orderNumber: "BST-DBN4NPYYTZ",
    buyerId: "b1",
    sellerId: "r1",
    productId: "boost-boost-1",
    status: "completed",
  };
  const listingOrder = {
    id: "o3",
    orderNumber: "ORD-NGGCF4J4V4",
    buyerId: "b1",
    sellerId: "r1",
    productId: "p1",
    status: "completed",
  };

  const expectRefused = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toMatchObject({
      response: { i18nKey: "server.rating.membershipOrder" },
    });
  };

  describe("createProductRating", () => {
    it.each([
      ["membership", membershipOrder],
      ["boost", boostOrder],
    ])("refuses a completed %s order", async (_kind, order) => {
      const service = makeService(order);
      await expectRefused(
        service.createProductRating("b1", {
          orderId: order.id,
          productId: order.productId,
          score: 5,
        } as CreateProductRatingDto),
      );
    });

    it("lets a listing order through to the ownership check", async () => {
      const service = makeService(listingOrder);
      // Another user: not a platform-service order, so the buyer check refuses.
      await expect(
        service.createProductRating("other", {
          orderId: "o3",
          productId: "p1",
          score: 5,
        } as CreateProductRatingDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("createUserRating (seller rating)", () => {
    it.each([
      ["membership", membershipOrder],
      ["boost", boostOrder],
    ])("refuses a completed %s order", async (_kind, order) => {
      const service = makeService(order);
      await expectRefused(
        service.createUserRating("b1", {
          receiverId: "r1",
          orderId: order.id,
          score: 5,
        } as CreateUserRatingDto),
      );
    });

    it("refuses a boost order that is not delivered yet with the digital-order reason", async () => {
      // The guard runs before the delivered-only check: the buyer is told the
      // order can never be rated, not to wait for delivery.
      const service = makeService({ ...boostOrder, status: "paid" });
      await expectRefused(
        service.createUserRating("b1", {
          receiverId: "r1",
          orderId: boostOrder.id,
          score: 5,
        } as CreateUserRatingDto),
      );
    });

    it("lets a listing order through to the party check", async () => {
      const service = makeService(listingOrder);
      await expect(
        service.createUserRating("other", {
          receiverId: "r1",
          orderId: "o3",
          score: 5,
        } as CreateUserRatingDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
