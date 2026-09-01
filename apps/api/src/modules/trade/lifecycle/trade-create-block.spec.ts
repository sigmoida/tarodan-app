import { ForbiddenException } from "@nestjs/common";
import { TradeLifecycleService } from "./trade-lifecycle.service";
import { userBlockServiceStub } from "../../user-block/user-block.testing";

describe("TradeLifecycleService.createTrade — user blocks", () => {
  it("refuses a trade proposal when either side blocked, before membership checks", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "r1" }) },
    };
    const canCreateTrade = jest.fn();
    const userBlocks = userBlockServiceStub({ blockedEither: true });
    const service = new TradeLifecycleService(
      prisma as any,
      {} as any,
      { canCreateTrade } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      userBlocks as any,
    );

    await expect(
      service.createTrade("i1", { receiverId: "r1", productId: "p1" } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userBlocks.isBlockedEither).toHaveBeenCalledWith("i1", "r1");
    expect(canCreateTrade).not.toHaveBeenCalled();
  });
});
