import {
  allReturnLegsDelivered,
  allReturnLegsResolved,
  finalizeReturningTradeIfResolved,
} from "./trade-return-finalize";
import { ProductStatus, TradeStatus } from "@prisma/client";

/**
 * `returning` kapanışının tek-kaynak sözleşmesi:
 *  - Kapanış şartı "tüm iade bacakları ÇÖZÜLDÜ"dür (teslim YA DA kayıp).
 *    Yalnız teslimleri saymak, "önce kayıp sonra teslim" sıralamasında takası
 *    sonsuza dek returning'de bırakıyordu; poll teslimi yazdığında da hiçbir
 *    yol kapanışı tetiklemiyordu (kalıcı takılma).
 *  - Kayıp bacaktaki ürünler stoktan düşer (satışa dönmez); teslim edilen
 *    bacaktakiler yalnız rezervasyon çözer.
 *  - Idempotent: cancelled takasta ve çözülmemiş bacak varken hiçbir şey yazmaz.
 */
describe("finalizeReturningTradeIfResolved", () => {
  const TRADE_ID = "trade-1";
  const INITIATOR = "user-ali";
  const RECEIVER = "user-burak";

  const makeTx = (opts: {
    tradeStatus?: TradeStatus;
    legs: Array<{
      deliveredAt: Date | null;
      lostAt: Date | null;
      recipientUserId: string | null;
    }>;
    items?: Array<{ productId: string; quantity: number; side: string }>;
    products?: Record<
      string,
      { reservedQuantity: number; quantity: number | null }
    >;
  }) => {
    const products = opts.products ?? {
      p1: { reservedQuantity: 1, quantity: 1 },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          status: opts.tradeStatus ?? TradeStatus.returning,
          initiatorId: INITIATOR,
          receiverId: RECEIVER,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      tradeShipment: {
        findMany: jest.fn().mockResolvedValue(opts.legs),
      },
      tradeItem: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.items ?? [{ productId: "p1", quantity: 1, side: "initiator" }],
          ),
      },
      product: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(products[where.id] ?? null),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return tx;
  };

  it("karışık çözüm (bir bacak kayıp + diğeri teslim): takas kapanır, kayıp taraf stoktan düşer", async () => {
    // Ali'nin iade kolisi kayboldu (ürünü Ali'ye dönemedi), Burak'ınki teslim.
    const tx = makeTx({
      legs: [
        { deliveredAt: null, lostAt: new Date(), recipientUserId: INITIATOR },
        { deliveredAt: new Date(), lostAt: null, recipientUserId: RECEIVER },
      ],
      items: [
        { productId: "p-ali", quantity: 1, side: "initiator" },
        { productId: "p-burak", quantity: 1, side: "receiver" },
      ],
      products: {
        "p-ali": { reservedQuantity: 1, quantity: 1 },
        "p-burak": { reservedQuantity: 1, quantity: 1 },
      },
    });

    const res = await finalizeReturningTradeIfResolved(tx as any, TRADE_ID);

    expect(res.finalized).toBe(true);
    // Kayıp bacağın ürünü: rezervasyon + stok düşer, satışa dönmez.
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p-ali" },
        data: expect.objectContaining({ quantity: 0 }),
      }),
    );
    // Teslim edilen bacağın ürünü: yalnız rezervasyon çözülür, stok DÜŞMEZ.
    const burakUpdate = tx.product.update.mock.calls.find(
      (c: any[]) => c[0].where.id === "p-burak",
    )![0];
    expect(burakUpdate.data.quantity).toBeUndefined();
    expect(burakUpdate.data.status).toBe(ProductStatus.active);
    // Takas kapanır.
    expect(tx.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TradeStatus.cancelled }),
      }),
    );
  });

  it("çözülmemiş bacak varken hiçbir şey yazmaz", async () => {
    const tx = makeTx({
      legs: [
        { deliveredAt: new Date(), lostAt: null, recipientUserId: RECEIVER },
        { deliveredAt: null, lostAt: null, recipientUserId: INITIATOR },
      ],
    });

    const res = await finalizeReturningTradeIfResolved(tx as any, TRADE_ID);

    expect(res.finalized).toBe(false);
    expect(res.allResolved).toBe(false);
    expect(tx.trade.update).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("zaten cancelled takasta idempotent no-op", async () => {
    const tx = makeTx({
      tradeStatus: TradeStatus.cancelled,
      legs: [
        { deliveredAt: new Date(), lostAt: null, recipientUserId: RECEIVER },
      ],
    });

    const res = await finalizeReturningTradeIfResolved(tx as any, TRADE_ID);

    expect(res.finalized).toBe(false);
    expect(res.allResolved).toBe(true);
    expect(tx.trade.update).not.toHaveBeenCalled();
  });

  it("tek bacaklı takas (RET-STK) tek teslimle kapanır", async () => {
    const tx = makeTx({
      legs: [
        { deliveredAt: new Date(), lostAt: null, recipientUserId: INITIATOR },
      ],
    });

    const res = await finalizeReturningTradeIfResolved(tx as any, TRADE_ID);

    expect(res.finalized).toBe(true);
    expect(tx.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TradeStatus.cancelled }),
      }),
    );
  });

  it("kapanış şartı yardımcıları: delivered-yalnız sayım ile çözülmüş sayım ayrışır", () => {
    const legs = [
      { deliveredAt: null, lostAt: new Date() },
      { deliveredAt: new Date(), lostAt: null },
    ];
    expect(allReturnLegsDelivered(legs)).toBe(false);
    expect(allReturnLegsResolved(legs)).toBe(true);
    expect(allReturnLegsResolved([])).toBe(false);
  });
});

const NOW = new Date("2026-08-12T12:00:00Z");

describe("trade return finalize condition", () => {
  it("closes a single-leg return once that leg is delivered (force-cancel-stuck path)", () => {
    expect(allReturnLegsDelivered([{ deliveredAt: NOW }])).toBe(true);
  });

  it("does not close a two-leg return while one leg is still in transit (warehouse reject path)", () => {
    expect(
      allReturnLegsDelivered([{ deliveredAt: NOW }, { deliveredAt: null }]),
    ).toBe(false);
  });

  it("closes a two-leg return when both legs are delivered", () => {
    expect(
      allReturnLegsDelivered([{ deliveredAt: NOW }, { deliveredAt: NOW }]),
    ).toBe(true);
  });

  it("never closes on an empty leg list", () => {
    expect(allReturnLegsDelivered([])).toBe(false);
    expect(allReturnLegsResolved([])).toBe(false);
  });

  it("markReturnLost counts a lost leg as resolved, including the single-leg case", () => {
    expect(allReturnLegsResolved([{ deliveredAt: null, lostAt: NOW }])).toBe(
      true,
    );
    expect(
      allReturnLegsResolved([
        { deliveredAt: NOW, lostAt: null },
        { deliveredAt: null, lostAt: NOW },
      ]),
    ).toBe(true);
    expect(
      allReturnLegsResolved([
        { deliveredAt: NOW, lostAt: null },
        { deliveredAt: null, lostAt: null },
      ]),
    ).toBe(false);
  });
});
