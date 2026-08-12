import { ShipmentStatus, TradeStatus } from "@prisma/client";
import {
  TRADE_ESCROW_SETTINGS,
  computeTradeConfirmationDeadline,
  computeTradeHoldReleaseAt,
  resolveTradeEscrowDays,
  startTradeConfirmationWindowIfDelivered,
  tradeLostParcelGraceDays,
} from "./trade-escrow";

const settingReader = (value: string | null) => ({
  platformSetting: {
    findUnique: jest
      .fn()
      .mockResolvedValue(value === null ? null : { settingValue: value }),
  },
});

const DAY = 24 * 60 * 60 * 1000;

describe("takas escrow ayarları (tek kaynak)", () => {
  it("ayardaki değeri okur", async () => {
    await expect(
      resolveTradeEscrowDays(
        settingReader("5"),
        TRADE_ESCROW_SETTINGS.HOLD_DAYS,
      ),
    ).resolves.toBe(5);
  });

  it("ayar satırı yoksa varsayılana düşer", async () => {
    await expect(
      resolveTradeEscrowDays(
        settingReader(null),
        TRADE_ESCROW_SETTINGS.HOLD_DAYS,
      ),
    ).resolves.toBe(TRADE_ESCROW_SETTINGS.HOLD_DAYS.default);
  });

  it("bozuk/negatif değerde varsayılana düşer (pencere sıfırlanmaz)", async () => {
    await expect(
      resolveTradeEscrowDays(
        settingReader(""),
        TRADE_ESCROW_SETTINGS.HOLD_DAYS,
      ),
    ).resolves.toBe(3);
    await expect(
      resolveTradeEscrowDays(
        settingReader("abc"),
        TRADE_ESCROW_SETTINGS.HOLD_DAYS,
      ),
    ).resolves.toBe(3);
    await expect(
      resolveTradeEscrowDays(
        settingReader("-4"),
        TRADE_ESCROW_SETTINGS.HOLD_DAYS,
      ),
    ).resolves.toBe(3);
    // 0 gün = hold tamamlanma anında çöker, para beklemesiz açılır — reddedilir.
    await expect(
      resolveTradeEscrowDays(
        settingReader("0"),
        TRADE_ESCROW_SETTINGS.HOLD_DAYS,
      ),
    ).resolves.toBe(3);
  });

  it("hold ve onay tarihlerini verilen andan hesaplar", async () => {
    const from = new Date("2026-08-12T09:00:00.000Z");
    await expect(
      computeTradeHoldReleaseAt(settingReader("3"), from),
    ).resolves.toEqual(new Date("2026-08-15T09:00:00.000Z"));
    await expect(
      computeTradeConfirmationDeadline(settingReader("3"), from),
    ).resolves.toEqual(new Date("2026-08-15T09:00:00.000Z"));
  });

  it("kayıp koli bekleme süresi env'den okunur, bozuksa 14", () => {
    const prev = process.env.TRADE_LOST_PARCEL_GRACE_DAYS;
    process.env.TRADE_LOST_PARCEL_GRACE_DAYS = "7";
    expect(tradeLostParcelGraceDays()).toBe(7);
    process.env.TRADE_LOST_PARCEL_GRACE_DAYS = "sıfır";
    expect(tradeLostParcelGraceDays()).toBe(14);
    if (prev === undefined) delete process.env.TRADE_LOST_PARCEL_GRACE_DAYS;
    else process.env.TRADE_LOST_PARCEL_GRACE_DAYS = prev;
  });
});

describe("startTradeConfirmationWindowIfDelivered", () => {
  const makeDb = (
    trade: { status: TradeStatus; confirmationDeadline: Date | null } | null,
    legs: Array<{ deliveredAt: Date | null; status?: ShipmentStatus }>,
    days = "3",
  ) => ({
    platformSetting: {
      findUnique: jest.fn().mockResolvedValue({ settingValue: days }),
    },
    trade: {
      findUnique: jest.fn().mockResolvedValue(trade),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    tradeShipment: {
      findMany: jest.fn().mockResolvedValue(
        legs.map((leg) => ({
          status: ShipmentStatus.delivered,
          ...leg,
        })),
      ),
    },
  });

  it("İKİ koli de teslimse pencereyi SON teslimattan başlatır", async () => {
    const first = new Date("2026-08-10T08:00:00.000Z");
    const last = new Date("2026-08-12T08:00:00.000Z");
    const db = makeDb(
      {
        status: TradeStatus.shipping_to_recipients,
        confirmationDeadline: null,
      },
      [{ deliveredAt: first }, { deliveredAt: last }],
    );

    const result = await startTradeConfirmationWindowIfDelivered(
      db as any,
      "trade-1",
    );

    expect(result).toEqual(new Date(last.getTime() + 3 * DAY));
    expect(db.trade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "trade-1",
          status: TradeStatus.shipping_to_recipients,
          confirmationDeadline: null,
        },
      }),
    );
  });

  it("tek koli bile teslim edilmediyse pencere BAŞLAMAZ", async () => {
    const db = makeDb(
      {
        status: TradeStatus.shipping_to_recipients,
        confirmationDeadline: null,
      },
      [{ deliveredAt: new Date() }, { deliveredAt: null }],
    );

    await expect(
      startTradeConfirmationWindowIfDelivered(db as any, "trade-1"),
    ).resolves.toBeNull();
    expect(db.trade.updateMany).not.toHaveBeenCalled();
  });

  it("pencere zaten kuruluysa ötelenmez (idempotent)", async () => {
    const db = makeDb(
      {
        status: TradeStatus.shipping_to_recipients,
        confirmationDeadline: new Date("2026-08-14T00:00:00.000Z"),
      },
      [{ deliveredAt: new Date() }],
    );

    await expect(
      startTradeConfirmationWindowIfDelivered(db as any, "trade-1"),
    ).resolves.toBeNull();
    expect(db.trade.updateMany).not.toHaveBeenCalled();
  });

  it("takas çıkış sevkinde değilse dokunmaz", async () => {
    const db = makeDb(
      { status: TradeStatus.disputed, confirmationDeadline: null },
      [{ deliveredAt: new Date() }],
    );

    await expect(
      startTradeConfirmationWindowIfDelivered(db as any, "trade-1"),
    ).resolves.toBeNull();
    expect(db.tradeShipment.findMany).not.toHaveBeenCalled();
  });

  it("iptal/dönüş bacağı pencereyi BLOKLAR — kalan bacağın teslimi yetmez", async () => {
    // Dönen koli yok sayılsaydı diğer bacağın teslimiyle pencere açılır,
    // takas otomatik tamamlanır ve o tarafın hiç almadığı ürünün parası
    // serbest kalırdı. Bu durum admin alarmına düşmeli.
    const db = makeDb(
      {
        status: TradeStatus.shipping_to_recipients,
        confirmationDeadline: null,
      },
      [
        { deliveredAt: new Date("2026-08-12T08:00:00.000Z") },
        { deliveredAt: null, status: ShipmentStatus.returned },
      ],
    );

    await expect(
      startTradeConfirmationWindowIfDelivered(db as any, "trade-1"),
    ).resolves.toBeNull();
    expect(db.trade.updateMany).not.toHaveBeenCalled();
  });

  it("hiç çıkış kolisi yoksa pencere kurulmaz", async () => {
    const db = makeDb(
      {
        status: TradeStatus.shipping_to_recipients,
        confirmationDeadline: null,
      },
      [],
    );

    await expect(
      startTradeConfirmationWindowIfDelivered(db as any, "trade-1"),
    ).resolves.toBeNull();
    expect(db.trade.updateMany).not.toHaveBeenCalled();
  });
});
