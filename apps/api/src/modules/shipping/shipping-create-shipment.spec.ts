import { ShippingService } from "./shipping.service";

describe("ShippingService.createShipment", () => {
  it("satıcı endpoint'ini kanonik order provisioner'a delege eder", async () => {
    const shipment = {
      id: "shipment-1",
      orderId: "order-1",
      provider: "surat",
      trackingNumber: "PKG-1",
      providerTrackingId: "SURAT-1",
      status: "pending",
      cost: { toString: () => "42.50" },
      events: [],
    };
    const orderShipments = {
      createForSeller: jest.fn().mockResolvedValue(shipment),
    };
    const service = new ShippingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      orderShipments as any,
    );

    const result = await service.createShipment("seller-1", {
      orderId: "order-1",
      provider: "surat",
    } as any);

    expect(orderShipments.createForSeller).toHaveBeenCalledWith(
      "seller-1",
      "order-1",
      "surat",
    );
    expect(result).toMatchObject({
      id: "shipment-1",
      trackingNumber: "PKG-1",
      providerTrackingId: "SURAT-1",
      cost: 42.5,
    });
  });
});
