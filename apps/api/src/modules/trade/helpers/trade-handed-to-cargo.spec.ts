import {
  isTradeHandedToCargo,
  tradeHandedToCargo,
} from "./trade-handed-to-cargo";

describe("isTradeHandedToCargo", () => {
  it("hiç bacak kargolanmadı ve depoya varış yok → kargolanmamış", () => {
    expect(
      isTradeHandedToCargo({
        firstWarehouseArrivalAt: null,
        anyLegShipped: false,
      }),
    ).toBe(false);
  });

  it("bir bacağın shippedAt'i dolu → kargolanmış", () => {
    expect(
      isTradeHandedToCargo({
        firstWarehouseArrivalAt: null,
        anyLegShipped: true,
      }),
    ).toBe(true);
  });

  it("ilk depo varışı damgalı → kargolanmış", () => {
    expect(
      isTradeHandedToCargo({
        firstWarehouseArrivalAt: new Date("2026-10-01T10:00:00.000Z"),
        anyLegShipped: false,
      }),
    ).toBe(true);
  });
});

describe("tradeHandedToCargo (sorgulu hâl aynı kuralı okur)", () => {
  const prismaWith = (arrival: Date | null, shipped: number) =>
    ({
      trade: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstWarehouseArrivalAt: arrival }),
      },
      tradeShipment: { count: jest.fn().mockResolvedValue(shipped) },
    }) as unknown as Parameters<typeof tradeHandedToCargo>[0];

  it.each<[Date | null, number, boolean]>([
    [null, 0, false],
    [null, 1, true],
    [new Date("2026-10-01T10:00:00.000Z"), 0, true],
  ])("varış=%s, kargolanan=%s → %s", async (arrival, shipped, expected) => {
    await expect(
      tradeHandedToCargo(prismaWith(arrival, shipped), "t1"),
    ).resolves.toBe(expected);
  });

  it("okuma hatasını yutmaz", async () => {
    const prisma = {
      trade: { findUnique: jest.fn().mockRejectedValue(new Error("db")) },
      tradeShipment: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as Parameters<typeof tradeHandedToCargo>[0];
    await expect(tradeHandedToCargo(prisma, "t1")).rejects.toThrow("db");
  });
});
