import {
  SuratCargoService,
  TEST_LANE_PROVIDER_MESSAGE,
  testLaneTrackingCode,
} from "./surat-cargo.service";

/**
 * Test şeridi kolisi taşıyıcıya HİÇ gitmez: canlı Sürat hesabında fiziksel
 * gönderi açılmasın, ama sipariş/takas/iade akışı sahte takip koduyla ilerlesin.
 */
describe("SuratCargoService — test lane", () => {
  const build = () => {
    const callCreateShipment = jest.fn().mockResolvedValue("Tamam");
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      del: jest.fn(),
    };
    const config = {
      get: jest.fn((_k: string, d?: string) => d),
    };
    const service = new SuratCargoService(
      config as never,
      cache as never,
      { callCreateShipment, getLocalTrackingCode: () => null } as never,
      { lookupTracking: jest.fn() } as never,
    );
    return { service, callCreateShipment, cache };
  };

  const request = (testLane?: boolean) => ({
    idempotencyKey: "k1",
    correlationId: "c1",
    reference: "PKG-000123456",
    sender: { name: "S", address: "a", city: "c", district: "d", phone: "p" },
    recipient: {
      name: "R",
      address: "a",
      city: "c",
      district: "d",
      phone: "p",
    },
    testLane,
  });

  it("returns a local success with a TEST tracking code without calling the carrier", async () => {
    const { service, callCreateShipment, cache } = build();
    const result = await service.createShipment(request(true) as never);
    expect(callCreateShipment).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      trackingCode: testLaneTrackingCode("PKG-000123456"),
      labelData: null,
      providerMessage: TEST_LANE_PROVIDER_MESSAGE,
    });
    expect(result.ok && result.trackingCode).toMatch(/^TEST\d{10}$/);
  });

  it("still dispatches live-lane shipments to the carrier", async () => {
    const { service, callCreateShipment } = build();
    await service.createShipment(request(false) as never);
    expect(callCreateShipment).toHaveBeenCalledTimes(1);
  });
});
