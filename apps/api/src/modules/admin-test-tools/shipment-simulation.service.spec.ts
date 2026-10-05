import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  OrderStatus,
  RefundRequestStatus,
  ShipmentStatus,
  TradeStatus,
} from "@prisma/client";
import { ShipmentSimulationService } from "./shipment-simulation.service";
import { interpretSuratTracking } from "../surat-cargo/mappers/surat-status.mapper";

/**
 * UAT kargo simülasyonu: okuma gerçek takip senkronunun çekirdeğine gider
 * (burada `SuratTrackingService` dikiş noktaları), servis kendisi hiçbir
 * kargo/sipariş alanına yazmaz. Canlıda yalnız test şeridi kolileri.
 */
describe("ShipmentSimulationService", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
  };
  const setDeployment = (nodeEnv: string, appEnv?: string) => {
    process.env.NODE_ENV = nodeEnv;
    if (appEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = appEnv;
  };
  afterEach(() => {
    if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.APP_ENV === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = saved.APP_ENV;
  });

  const shipmentRow = (overrides: Record<string, unknown> = {}) => ({
    id: "ship-1",
    status: ShipmentStatus.label_created,
    trackingNumber: "PKG-000123",
    providerTrackingId: "STUB0000000123",
    shippedAt: null,
    deliveredAt: null,
    order: {
      orderNumber: "ORD-10001",
      status: OrderStatus.preparing,
      isTest: false,
    },
    ...overrides,
  });

  const makeService = (
    opts: {
      shipments?: unknown[][];
      refunds?: unknown[][];
      trades?: unknown[][];
    } = {},
  ) => {
    const queue = (batches: unknown[][] | undefined) => {
      const fn = jest.fn().mockResolvedValue([]);
      for (const batch of batches ?? []) fn.mockResolvedValueOnce(batch);
      return fn;
    };
    const prisma = {
      shipment: {
        findMany: queue(opts.shipments),
        // Kolideki canlı-şerit satır sayısı (canlıda kapı); varsayılan: yok.
        count: jest.fn().mockResolvedValue(0),
      },
      refundRequest: { findMany: queue(opts.refunds) },
      tradeShipment: { findMany: queue(opts.trades) },
    };
    const tracking = {
      applyOrderParcelReading: jest
        .fn()
        .mockResolvedValue([{ shipmentId: "ship-1", outcome: "updated" }]),
      applyRefundReturnReading: jest.fn().mockResolvedValue("synced"),
      applyTradeShipmentReading: jest.fn().mockResolvedValue("synced"),
    };
    const service = new ShipmentSimulationService(
      prisma as never,
      tracking as never,
    );
    return { service, prisma, tracking };
  };

  describe("search", () => {
    it("ignores queries shorter than two characters", async () => {
      const { service, prisma } = makeService();
      await expect(service.search(" a ")).resolves.toEqual([]);
      expect(prisma.shipment.findMany).not.toHaveBeenCalled();
    });

    it("lists parcels of every kind with their offered next steps (staging: no lane filter)", async () => {
      setDeployment("production", "staging");
      const { service, prisma } = makeService({
        shipments: [[shipmentRow()]],
        refunds: [
          [
            {
              id: "rf-1",
              refundNumber: "RF-1",
              status: RefundRequestStatus.return_in_transit,
              returnStatus: ShipmentStatus.picked_up,
              returnTrackingNumber: "RF-1",
              returnProviderTrackingId: null,
              returnShippedAt: new Date("2026-10-05T10:00:00Z"),
              returnDeliveredAt: null,
              order: { isTest: false },
            },
          ],
        ],
        trades: [
          [
            {
              id: "leg-1",
              leg: "to_warehouse",
              status: ShipmentStatus.label_created,
              trackingNumber: "TKS-LEG-1",
              providerTrackingId: null,
              shippedAt: null,
              deliveredAt: null,
              trade: {
                tradeNumber: "TKS-10001",
                status: TradeStatus.shipping_to_warehouse,
                isTest: false,
              },
            },
          ],
        ],
      });

      const parcels = await service.search("10001");

      expect(parcels.map((p) => [p.kind, p.reference, p.nextSteps])).toEqual([
        ["order_shipment", "ORD-10001", ["picked_up", "delivered"]],
        ["refund_return", "RF-1", ["delivered"]],
        ["trade_shipment", "TKS-10001", ["picked_up", "delivered"]],
      ]);
      const where = prisma.shipment.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ provider: "surat" });
      expect(where.order).toBeUndefined();
      expect(where.OR).toEqual(
        expect.arrayContaining([
          {
            order: { orderNumber: { contains: "10001", mode: "insensitive" } },
          },
          {
            orderPackage: {
              packageNumber: { contains: "10001", mode: "insensitive" },
            },
          },
        ]),
      );
    });

    it("on the live deployment lists test-lane parcels only", async () => {
      setDeployment("production", "production");
      const { service, prisma } = makeService();

      await service.search("ORD-1");

      expect(prisma.shipment.findMany.mock.calls[0][0].where).toMatchObject({
        order: { isTest: true },
      });
      expect(
        prisma.refundRequest.findMany.mock.calls[0][0].where,
      ).toMatchObject({ order: { isTest: true } });
      expect(
        prisma.tradeShipment.findMany.mock.calls[0][0].where,
      ).toMatchObject({ trade: { isTest: true } });
    });
  });

  describe("simulate", () => {
    beforeEach(() => setDeployment("production", "staging"));

    it("feeds a delivery reading into the real parcel sync core and reports the new state", async () => {
      const { service, tracking } = makeService({
        shipments: [
          [shipmentRow()],
          [
            shipmentRow({
              status: ShipmentStatus.delivered,
              order: {
                orderNumber: "ORD-10001",
                status: OrderStatus.delivered,
                isTest: false,
              },
            }),
          ],
        ],
      });

      const res = await service.simulate(
        "order_shipment",
        "ship-1",
        "delivered",
      );

      expect(tracking.applyOrderParcelReading).toHaveBeenCalledTimes(1);
      const [ref, reading] = tracking.applyOrderParcelReading.mock.calls[0];
      expect(ref).toBe("PKG-000123");
      expect(reading.KargoTakipNo).toBe("STUB0000000123");
      expect(interpretSuratTracking(reading)).toMatchObject({
        status: ShipmentStatus.delivered,
        isDelivered: true,
      });
      expect(res).toMatchObject({
        applied: true,
        before: { status: ShipmentStatus.label_created },
        after: { status: ShipmentStatus.delivered, nextSteps: [] },
      });
    });

    it("reports applied=false when the core skipped the row (e.g. lost a race)", async () => {
      const { service, tracking } = makeService({
        shipments: [[shipmentRow()], [shipmentRow()]],
      });
      tracking.applyOrderParcelReading.mockResolvedValue([
        { shipmentId: "ship-1", outcome: "skipped" },
      ]);

      const res = await service.simulate(
        "order_shipment",
        "ship-1",
        "picked_up",
      );
      expect(res.applied).toBe(false);
    });

    it("uses a SIM carrier code when the parcel has none yet", async () => {
      const { service, tracking } = makeService({
        shipments: [
          [shipmentRow({ providerTrackingId: null })],
          [shipmentRow()],
        ],
      });

      await service.simulate("order_shipment", "ship-1", "picked_up");

      const reading = tracking.applyOrderParcelReading.mock.calls[0][1];
      expect(reading.KargoTakipNo).toBe("SIM0000000123");
    });

    it("refuses a step the parcel cannot take — delivering a cancelled order never reaches the core", async () => {
      const { service, tracking } = makeService({
        shipments: [
          [
            shipmentRow({
              status: ShipmentStatus.in_transit,
              order: {
                orderNumber: "ORD-10001",
                status: OrderStatus.cancelled,
                isTest: false,
              },
            }),
          ],
        ],
      });

      await expect(
        service.simulate("order_shipment", "ship-1", "delivered"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tracking.applyOrderParcelReading).not.toHaveBeenCalled();
    });

    it("refuses a second pickup once the parcel is moving", async () => {
      const { service, tracking } = makeService({
        shipments: [
          [
            shipmentRow({
              status: ShipmentStatus.picked_up,
              shippedAt: new Date(),
            }),
          ],
        ],
      });

      await expect(
        service.simulate("order_shipment", "ship-1", "picked_up"),
      ).rejects.toMatchObject({
        response: {
          i18nKey: "server.admin.testTools.simulationStepUnavailable",
        },
      });
      expect(tracking.applyOrderParcelReading).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown parcel", async () => {
      const { service } = makeService();
      await expect(
        service.simulate("order_shipment", "missing", "delivered"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("routes a return parcel to the refund-return core", async () => {
      const refund = {
        id: "rf-1",
        refundNumber: "RF-1",
        status: RefundRequestStatus.return_shipment_open,
        returnStatus: ShipmentStatus.label_created,
        returnTrackingNumber: "RF-1",
        returnProviderTrackingId: "STUB0000000001",
        returnShippedAt: null,
        returnDeliveredAt: null,
        order: { isTest: false },
      };
      const { service, tracking } = makeService({
        refunds: [[refund], [refund]],
      });

      await service.simulate("refund_return", "rf-1", "picked_up");

      expect(tracking.applyRefundReturnReading).toHaveBeenCalledWith(
        "rf-1",
        expect.objectContaining({ KargonunDurumuSayi: 1 }),
      );
      expect(tracking.applyOrderParcelReading).not.toHaveBeenCalled();
    });

    it("routes a trade leg to the trade core", async () => {
      const leg = {
        id: "leg-1",
        leg: "from_warehouse",
        status: ShipmentStatus.in_transit,
        trackingNumber: "TKS-LEG-1",
        providerTrackingId: "STUB1",
        shippedAt: new Date(),
        deliveredAt: null,
        trade: {
          tradeNumber: "TKS-10001",
          status: TradeStatus.shipping_to_recipients,
          isTest: false,
        },
      };
      const { service, tracking } = makeService({ trades: [[leg], [leg]] });

      await service.simulate("trade_shipment", "leg-1", "delivered");

      expect(tracking.applyTradeShipmentReading).toHaveBeenCalledWith(
        "leg-1",
        expect.objectContaining({ KargonunDurumuSayi: 6 }),
      );
    });

    describe("on the live deployment", () => {
      beforeEach(() => setDeployment("production", "production"));

      it("refuses a real customer's parcel", async () => {
        const { service, tracking } = makeService({
          shipments: [[shipmentRow()]],
        });

        await expect(
          service.simulate("order_shipment", "ship-1", "delivered"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(tracking.applyOrderParcelReading).not.toHaveBeenCalled();
      });

      it("also refuses when APP_ENV is missing (fails closed)", async () => {
        setDeployment("production");
        const { service, tracking } = makeService({
          shipments: [[shipmentRow()]],
        });

        await expect(
          service.simulate("order_shipment", "ship-1", "delivered"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(tracking.applyOrderParcelReading).not.toHaveBeenCalled();
      });

      it("allows a test-lane parcel (store review needs delivery too)", async () => {
        const testLane = shipmentRow({
          order: {
            orderNumber: "ORD-10001",
            status: OrderStatus.preparing,
            isTest: true,
          },
        });
        const { service, tracking, prisma } = makeService({
          shipments: [[testLane], [testLane]],
        });

        await service.simulate("order_shipment", "ship-1", "picked_up");
        expect(tracking.applyOrderParcelReading).toHaveBeenCalledTimes(1);
        // Kolinin TÜM satırları denetlendi (seçilen satırla yetinilmedi).
        expect(prisma.shipment.count).toHaveBeenCalledWith({
          where: {
            provider: "surat",
            trackingNumber: "PKG-000123",
            order: { isTest: false },
          },
        });
      });

      it("refuses when any sibling row of the parcel belongs to a live-lane order", async () => {
        const testLane = shipmentRow({
          order: {
            orderNumber: "ORD-10001",
            status: OrderStatus.preparing,
            isTest: true,
          },
        });
        const { service, tracking, prisma } = makeService({
          shipments: [[testLane]],
        });
        prisma.shipment.count.mockResolvedValue(1);

        await expect(
          service.simulate("order_shipment", "ship-1", "delivered"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(tracking.applyOrderParcelReading).not.toHaveBeenCalled();
      });
    });

    it("does not run the sibling lane check outside the live deployment", async () => {
      const { service, prisma } = makeService({
        shipments: [[shipmentRow()], [shipmentRow()]],
      });

      await service.simulate("order_shipment", "ship-1", "picked_up");
      expect(prisma.shipment.count).not.toHaveBeenCalled();
    });
  });
});
