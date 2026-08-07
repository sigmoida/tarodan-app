import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { RefundService } from "./refund.service";

/**
 * Üyelik/dijital siparişler ("MEM-" sipariş no, platform satıcısı) genel iade akışına
 * girmez; üyeliğin kendi iptal akışı vardır. Guard, ürün-tipine özgü diğer
 * kontrollerden ÖNCE devreye girer (buyer/payment kontrolünden önce).
 */
describe("RefundService.createRefundRequest — üyelik siparişi guard", () => {
  const makeService = (order: any) => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
    };
    return new RefundService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  };

  it('"MEM-" siparişinde iade talebini reddeder', async () => {
    const service = makeService({
      id: "o1",
      orderNumber: "MEM-1781257318265-BENIPST9F",
      buyerId: "buyer1",
      status: "completed",
      payment: { status: "completed" },
    });
    await expect(
      service.createRefundRequest("o1", "buyer1", { reason: "damaged" } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("normal siparişte guard tetiklenmez → alıcı doğrulamasına ilerler", async () => {
    const service = makeService({
      id: "o1",
      orderNumber: "TRD-1001",
      buyerId: "buyer1",
      status: "completed",
      payment: { status: "completed" },
    });
    // Farklı kullanıcı → membership değil; buyer kontrolü Forbidden atmalı
    await expect(
      service.createRefundRequest("o1", "someoneElse", {
        reason: "damaged",
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
