import { enqueueSellerListingReindex } from "./seller-listing-reindex";
import { ProductKind } from "@prisma/client";

describe("enqueueSellerListingReindex", () => {
  const makePrisma = (ids: string[]) => ({
    product: {
      findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
    },
  });

  it("queues every seller listing so sale and trade capability stay current", async () => {
    const prisma = makePrisma(["p1", "p2"]);
    const queue = { add: jest.fn().mockResolvedValue(undefined) };

    await expect(
      enqueueSellerListingReindex(prisma as any, queue as any, "seller-1"),
    ).resolves.toBe(2);
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { sellerId: "seller-1", kind: ProductKind.listing },
      select: { id: true },
    });
    expect(queue.add).toHaveBeenCalledWith("bulk-index", {
      type: "bulk-index",
      entityType: "product",
      entityIds: ["p1", "p2"],
    });
  });

  it("does not queue an empty seller and remains best-effort", async () => {
    const empty = makePrisma([]);
    const queue = { add: jest.fn() };
    await expect(
      enqueueSellerListingReindex(empty as any, queue as any, "seller-1"),
    ).resolves.toBe(0);
    expect(queue.add).not.toHaveBeenCalled();

    const failing = makePrisma(["p1"]);
    const brokenQueue = {
      add: jest.fn().mockRejectedValue(new Error("redis down")),
    };
    await expect(
      enqueueSellerListingReindex(
        failing as any,
        brokenQueue as any,
        "seller-1",
      ),
    ).resolves.toBe(0);
  });
});
