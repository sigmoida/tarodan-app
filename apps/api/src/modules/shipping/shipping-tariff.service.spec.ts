import { ServiceUnavailableException } from "@nestjs/common";
import { ShippingTariffStatus } from "@prisma/client";
import { ShippingTariffService } from "./shipping-tariff.service";

describe("ShippingTariffService active tariff", () => {
  const tariff = (version: number) =>
    ({
      id: `tariff-${version}`,
      provider: "surat",
      status: ShippingTariffStatus.active,
      version,
      outboundPackageFee: 30 + version,
      freeShippingEnabled: true,
      freeShippingThreshold: 500,
      returnPackageFee: 30,
      tradeLegFee: 30,
    }) as any;

  it("reads the active row for every request so sibling instances cannot stay stale", async () => {
    const prisma = {
      shippingTariff: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(tariff(1))
          .mockResolvedValueOnce(tariff(2)),
      },
    } as any;
    const service = new ShippingTariffService(prisma);

    expect((await service.getActiveTariff()).version).toBe(1);
    expect((await service.getActiveTariff()).version).toBe(2);
    expect(prisma.shippingTariff.findFirst).toHaveBeenCalledTimes(2);
  });

  it("fails closed when no active tariff can be snapshotted", async () => {
    const prisma = {
      shippingTariff: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;
    const service = new ShippingTariffService(prisma);

    await expect(service.getActiveOutboundTariff()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("rejects activation when the mandatory legacy 1-desi rate is missing", async () => {
    const prisma = {
      shippingTariff: {
        findUnique: jest.fn().mockResolvedValue({
          ...tariff(3),
          status: ShippingTariffStatus.draft,
          rates: [{ id: "rate-2", desi: 2, amount: 180 }],
        }),
      },
    } as any;
    const service = new ShippingTariffService(prisma);

    await expect(service.activate("tariff-3", "admin-1")).rejects.toMatchObject(
      {
        response: { code: "SHIPPING_ONE_DESI_RATE_REQUIRED" },
      },
    );
  });
});
