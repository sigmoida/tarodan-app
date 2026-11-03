import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { InstallmentRatesService } from "./installment-rates.service";

const HOUR = 60 * 60 * 1000;

function snapshot(ageHours: number) {
  return {
    id: `snap-${ageHours}`,
    fetchedAt: new Date(Date.now() - ageHours * HOUR),
    singleRatePct: new Prisma.Decimal("3"),
    maxInstallmentNonBusiness: 12,
    rates: { world: { "3": "8" } },
  };
}

function setup(
  opts: {
    latest?: ReturnType<typeof snapshot> | null;
    claim?: "claimed" | "held" | "unavailable";
    rates?: unknown;
    enabled?: boolean;
  } = {},
) {
  let latest = opts.latest ?? null;
  const prisma = {
    installmentRateSnapshot: {
      findFirst: jest.fn(async () => latest),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        latest = {
          id: data.id as string,
          fetchedAt: data.fetchedAt as Date,
          singleRatePct: data.singleRatePct as Prisma.Decimal,
          maxInstallmentNonBusiness: data.maxInstallmentNonBusiness as number,
          rates: data.rates as never,
        };
        return latest;
      }),
    },
  };
  const cache = {
    claimKey: jest.fn(async () => opts.claim ?? "claimed"),
    del: jest.fn(async () => undefined),
  };
  const provider = {
    getInstallmentRates: jest.fn(async (requestId: string) =>
      opts.rates !== undefined
        ? opts.rates
        : {
            ok: true,
            requestId,
            maxInstallmentNonBusiness: 12,
            singleRatePct: "2.99",
            rates: { world: { "3": "8" } },
            ignored: [],
            raw: { status: "success" },
          },
    ),
  };
  const providers = { resolve: jest.fn(() => provider) };
  const settings = {
    read: jest.fn(async () => ({ enabled: opts.enabled ?? false })),
  };
  const service = new InstallmentRatesService(
    prisma as never,
    cache as never,
    providers as never,
    settings as never,
  );
  return { service, prisma, cache, provider, providers };
}

describe("InstallmentRatesService", () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    error = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("prices from the latest snapshot while it is younger than 36 h, without calling PayTR", async () => {
    const { service, provider, cache } = setup({ latest: snapshot(35) });
    expect((await service.freshSnapshot())?.id).toBe("snap-35");
    expect(provider.getInstallmentRates).not.toHaveBeenCalled();
    expect(cache.claimKey).not.toHaveBeenCalled();
  });

  it("refreshes a stale snapshot once on demand, under a lock, within the 3 s budget", async () => {
    const { service, provider, cache, providers } = setup({
      latest: snapshot(37),
    });
    const fresh = await service.freshSnapshot();
    expect(fresh?.singleRatePct.toString()).toBe("2.99");
    expect(providers.resolve).toHaveBeenCalledWith("paytr", "marketplace");
    expect(provider.getInstallmentRates).toHaveBeenCalledWith(
      expect.any(String),
      {
        singleRatio: true,
        timeoutMs: 3000,
      },
    );
    expect(cache.claimKey).toHaveBeenCalledWith(
      "installments:rates:refresh:marketplace",
      30,
    );
    expect(cache.del).toHaveBeenCalledWith(
      "installments:rates:refresh:marketplace",
    );
  });

  it.each(["held", "unavailable"] as const)(
    "reports unavailable without calling PayTR when the lock is %s",
    async (claim) => {
      const { service, provider } = setup({ latest: snapshot(40), claim });
      expect(await service.freshSnapshot()).toBeNull();
      expect(provider.getInstallmentRates).not.toHaveBeenCalled();
    },
  );

  it("keeps the lock after a failed on-demand fetch: one PayTR call per lock period, not per request", async () => {
    const { service, cache, provider } = setup({
      latest: snapshot(40),
      rates: { ok: false, errMsg: "timeout" },
    });
    expect(await service.freshSnapshot()).toBeNull();
    expect(cache.del).not.toHaveBeenCalled();
    cache.claimKey.mockResolvedValueOnce("held");
    expect(await service.freshSnapshot()).toBeNull();
    expect(provider.getInstallmentRates).toHaveBeenCalledTimes(1);
  });

  it("keeps the lock after an incomplete answer too (no single rate before S0)", async () => {
    const { service, cache } = setup({
      latest: null,
      rates: {
        ok: true,
        requestId: "x",
        rates: { world: { "3": "8" } },
        ignored: [],
        raw: {},
      },
    });
    expect(await service.freshSnapshot()).toBeNull();
    expect(cache.del).not.toHaveBeenCalled();
  });

  it("uses the snapshot id without hyphens as request_id and stores the answer", async () => {
    const { service, prisma, provider } = setup();
    expect(await service.refresh()).toBe("stored");
    const requestId = provider.getInstallmentRates.mock.calls[0][0];
    const data = prisma.installmentRateSnapshot.create.mock.calls[0][0].data;
    expect(requestId).toHaveLength(32);
    expect(String(data.id).replace(/-/g, "")).toBe(requestId);
    expect(data).toMatchObject({
      paytrMerchant: "marketplace",
      maxInstallmentNonBusiness: 12,
      rates: { world: { "3": "8" } },
      raw: { status: "success" },
    });
    expect(String(data.singleRatePct)).toBe("2.99");
  });

  it.each`
    case                    | rates
    ${"no single rate"}     | ${{ ok: true, requestId: "x", singleRatePct: undefined, rates: { world: { "3": "8" } }, ignored: [], raw: {} }}
    ${"empty family table"} | ${{ ok: true, requestId: "x", singleRatePct: "2.99", rates: {}, ignored: [], raw: {} }}
  `("does not store a snapshot with $case (fail closed)", async ({ rates }) => {
    const { service, prisma } = setup({ rates });
    expect(await service.refresh()).toBe("incomplete");
    expect(prisma.installmentRateSnapshot.create).not.toHaveBeenCalled();
  });

  it("reports a PayTR failure as failed", async () => {
    const { service } = setup({
      rates: { ok: false, errMsg: "Invalid token" },
    });
    expect(await service.refresh()).toBe("failed");
  });

  describe("runDailyRefresh (cron paytr-installment-rates)", () => {
    it("stores the day's snapshot and raises no alarm", async () => {
      const { service } = setup();
      const result = await service.runDailyRefresh();
      expect(result.stats).toEqual({ stored: 1, stale: 0 });
      expect(error).not.toHaveBeenCalled();
    });

    it("alarms INSTALLMENT_RATES_STALE at error while installments are on", async () => {
      const { service } = setup({
        latest: snapshot(25),
        rates: { ok: false, errMsg: "down" },
        enabled: true,
      });
      const result = await service.runDailyRefresh();
      expect(result.stats).toEqual({ stored: 0, stale: 1 });
      expect(String(error.mock.calls[0][0])).toContain(
        "INSTALLMENT_RATES_STALE",
      );
    });

    it("only warns about stale rates while installments are off (no daily noise before S0)", async () => {
      const { service } = setup({
        latest: null,
        rates: { ok: true, requestId: "x", rates: {}, ignored: [], raw: {} },
        enabled: false,
      });
      await service.runDailyRefresh();
      expect(error).not.toHaveBeenCalled();
      expect(
        warn.mock.calls.some((call) =>
          String(call[0]).includes("INSTALLMENT_RATES_STALE"),
        ),
      ).toBe(true);
    });

    it("alarms on the first missed run even when it failed faster than yesterday's fetch", async () => {
      // Yesterday's snapshot is just under 24 h old when today's run fails.
      const { service } = setup({
        latest: snapshot(23.99),
        rates: { ok: false, errMsg: "down" },
        enabled: true,
      });
      await service.runDailyRefresh();
      expect(String(error.mock.calls[0]?.[0])).toContain(
        "INSTALLMENT_RATES_STALE",
      );
    });

    it("does not alarm while a snapshot is younger than 20 h (e.g. an on-demand refresh)", async () => {
      const { service } = setup({
        latest: snapshot(19),
        rates: { ok: false, errMsg: "down" },
        enabled: true,
      });
      await service.runDailyRefresh();
      expect(error).not.toHaveBeenCalled();
    });
  });
});
