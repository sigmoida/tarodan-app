import { ShipmentStatus, TradeStatus } from "@prisma/client";
import {
  computeTradeConfirmationDeadline,
  computeTradeHoldReleaseAt,
  startTradeConfirmationWindowIfDelivered,
} from "./trade-escrow";

/** Anahtar → değer haritasından ayar okuyucusu (yalnız istenen anahtar döner). */
const settingReader = (rows: Record<string, string> = {}) => ({
  platformSetting: {
    findUnique: jest.fn(async ({ where }: { where: { settingKey: string } }) =>
      where.settingKey in rows
        ? { settingValue: rows[where.settingKey] }
        : null,
    ),
  },
});

const DAY = 24 * 60 * 60 * 1000;
const FROM = new Date("2026-08-12T09:00:00.000Z");

describe("takas escrow süreleri (Süreler ve Kurallar kaydından)", () => {
  it("hold ve onay tarihlerini kendi ayar anahtarlarından hesaplar", async () => {
    const db = settingReader({
      payment_hold_days: "5",
      trade_confirmation_deadline_days: "2",
    });
    await expect(computeTradeHoldReleaseAt(db, FROM)).resolves.toEqual(
      new Date(FROM.getTime() + 5 * DAY),
    );
    await expect(computeTradeConfirmationDeadline(db, FROM)).resolves.toEqual(
      new Date(FROM.getTime() + 2 * DAY),
    );
  });

  it("ayar satırı yokken bugünkü varsayılanlar (3 + 3 gün) geçerlidir", async () => {
    await expect(
      computeTradeHoldReleaseAt(settingReader(), FROM),
    ).resolves.toEqual(new Date("2026-08-15T09:00:00.000Z"));
    await expect(
      computeTradeConfirmationDeadline(settingReader(), FROM),
    ).resolves.toEqual(new Date("2026-08-15T09:00:00.000Z"));
  });

  it.each(["", "abc", "-4", "0"])(
    "bozuk/sıfır/negatif değer (%p) varsayılana düşer — hold çökmez",
    async (raw) => {
      // 0 gün = hold tamamlanma anında çöker, para beklemesiz açılır.
      await expect(
        computeTradeHoldReleaseAt(
          settingReader({ payment_hold_days: raw }),
          FROM,
        ),
      ).resolves.toEqual(new Date(FROM.getTime() + 3 * DAY));
    },
  );
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
