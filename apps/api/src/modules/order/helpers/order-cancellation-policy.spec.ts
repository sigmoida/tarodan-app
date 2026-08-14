import {
  OrderCancellationReason,
  OrderStatus,
  ShipmentStatus,
} from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
import { OrderLifecycleService } from "../order-lifecycle.service";

describe("OrderLifecycleService structured cancellation", () => {
  const makeService = (shipmentStatus: ShipmentStatus) => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "order-1",
          buyerId: "buyer-1",
          status: OrderStatus.paid,
          shipment: { status: shipmentStatus },
        }),
      },
    };
    const refund = {
      createCancellationRefund: jest.fn().mockResolvedValue({ id: "refund-1" }),
    };
    const orderQuery = {
      findOne: jest.fn().mockResolvedValue({
        id: "order-1",
        status: OrderStatus.cancelled,
      }),
    };
    const service = new OrderLifecycleService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      orderQuery as any,
      {} as any,
      {} as any,
      refund as any,
    );
    return { service, refund, orderQuery };
  };

  it("routes a paid pre-handover cancellation through the refund policy service", async () => {
    const { service, refund, orderQuery } = makeService(ShipmentStatus.pending);

    const result = await service.cancel("order-1", "buyer-1", {
      reasonCode: OrderCancellationReason.wrong_card,
      reason: "Yanlış kart",
    });

    expect(refund.createCancellationRefund).toHaveBeenCalledWith(
      "order-1",
      "buyer-1",
      OrderCancellationReason.wrong_card,
      "Yanlış kart",
    );
    expect(orderQuery.findOne).toHaveBeenCalledWith("order-1", "buyer-1");
    expect(result.status).toBe(OrderStatus.cancelled);
  });

  it("keeps a registered but not-yet-accepted shipment cancellable", async () => {
    const { service, refund } = makeService(ShipmentStatus.label_created);

    await service.cancel("order-1", "buyer-1", {
      reasonCode: OrderCancellationReason.changed_mind,
    });

    expect(refund.createCancellationRefund).toHaveBeenCalledTimes(1);
  });

  it("rejects cancellation after carrier handover and directs the flow to returns", async () => {
    const { service, refund } = makeService(ShipmentStatus.picked_up);

    await expect(
      service.cancel("order-1", "buyer-1", {
        reasonCode: OrderCancellationReason.changed_mind,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(refund.createCancellationRefund).not.toHaveBeenCalled();
  });

  it("requires a structured reason for paid cancellation", async () => {
    const { service, refund } = makeService(ShipmentStatus.pending);

    await expect(
      service.cancel("order-1", "buyer-1", {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(refund.createCancellationRefund).not.toHaveBeenCalled();
  });
});
