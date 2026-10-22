import { BadRequestException } from "@nestjs/common";
import { ConsentSource, Prisma } from "@prisma/client";
import {
  CONSENT_DOCUMENTS,
  DISTANCE_SALES_CONSENT_REQUIRED_SETTING,
} from "@tarodan/types";
import { ConsentService } from "./consent.service";
import { DistanceSalesConsentService } from "./distance-sales-consent.service";
import { TRADE_CONSENT_UNIQUE_INDEX } from "./helpers/distance-sales-trade";

function makeService(opts: { existing?: boolean; setting?: string | null }) {
  const prisma = {
    consentRecord: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.existing ? { id: "consent-1" } : null),
      createMany: jest
        .fn()
        .mockImplementation(({ data }: { data: unknown[] }) =>
          Promise.resolve({ count: data.length }),
        ),
    },
    platformSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.setting === undefined || opts.setting === null
            ? null
            : { settingValue: opts.setting },
        ),
    },
  };
  const consents = new ConsentService(prisma as never);
  return {
    service: new DistanceSalesConsentService(prisma as never, consents),
    prisma,
  };
}

const offerOrder = { orderId: "order-1", userId: "buyer-1", guestEmail: null };

describe("DistanceSalesConsentService.ensureForPayment", () => {
  it("teklif siparişinde ödeme sayfasındaki onayı siparişe bağlı kaydeder", async () => {
    const { service, prisma } = makeService({});

    await expect(service.ensureForPayment(offerOrder, true)).resolves.toBe(
      "record",
    );

    const [row] = prisma.consentRecord.createMany.mock.calls[0][0].data;
    expect(row).toMatchObject({
      document: "distance_sales",
      version: CONSENT_DOCUMENTS.distance_sales.version,
      source: ConsentSource.payment,
      orderId: "order-1",
      userId: "buyer-1",
      tradeCashPaymentId: null,
    });
    expect(row.details).toBeUndefined();
  });

  it("checkout'ta kaydedilmiş sepet için ikinci satır yazmaz", async () => {
    const { service, prisma } = makeService({ existing: true });

    await expect(
      service.ensureForPayment(
        { checkoutGroupId: "group-1", userId: "buyer-1", guestEmail: null },
        true,
      ),
    ).resolves.toBe("proceed");
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
    expect(prisma.consentRecord.findFirst.mock.calls[0][0].where.OR).toEqual([
      { checkoutGroupId: "group-1" },
    ]);
  });

  it("zorunluluk ayarı YOKKEN (varsayılan) onaysız eski istemci ödemeye devam eder", async () => {
    const { service, prisma } = makeService({ setting: null });

    await expect(service.ensureForPayment(offerOrder, undefined)).resolves.toBe(
      "unrecorded",
    );
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
    expect(prisma.platformSetting.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settingKey: DISTANCE_SALES_CONSENT_REQUIRED_SETTING },
      }),
    );
  });

  it("ayar 'false' iken de reddetmez", async () => {
    const { service } = makeService({ setting: "false" });

    await expect(service.ensureForPayment(offerOrder, false)).resolves.toBe(
      "unrecorded",
    );
  });

  it("ayar 'true' iken onaysız ve kayıtsız ödeme reddedilir", async () => {
    const { service, prisma } = makeService({ setting: "true" });

    await expect(
      service.ensureForPayment(offerOrder, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });

  // The parser delegates to the shared `isPlatformSettingOn` (T8b): pin the
  // values it read before, so a change to the shared rule cannot silently
  // open or close the payment gate.
  it.each(["true", " TRUE ", "True"])(
    "treats %p as on and refuses the payment without a consent",
    async (setting) => {
      const { service } = makeService({ setting });

      await expect(
        service.ensureForPayment(offerOrder, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each(["", "1", "yes", "on", "TRUE!"])(
    "treats %p as off and lets an old client pay",
    async (setting) => {
      const { service } = makeService({ setting });

      await expect(
        service.ensureForPayment(offerOrder, undefined),
      ).resolves.toBe("unrecorded");
    },
  );

  it("ayar açıkken checkout'ta alınmış onay ödemeyi geçirir", async () => {
    const { service } = makeService({ existing: true, setting: "true" });

    await expect(
      service.ensureForPayment(
        { checkoutGroupId: "group-1", userId: null, guestEmail: "g@x.com" },
        undefined,
      ),
    ).resolves.toBe("proceed");
  });

  it("skips the gate for a platform service (membership, boost)", async () => {
    const { service, prisma } = makeService({ setting: "true" });

    await expect(service.ensureForPayment(null, undefined)).resolves.toBeNull();
    expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
  });

  it("misafir onayını misafir e-postasıyla kaydeder (sistem hesabıyla değil)", async () => {
    const { service, prisma } = makeService({});

    await service.ensureForPayment(
      { checkoutGroupId: "group-9", userId: null, guestEmail: "G@X.com" },
      true,
    );

    const [row] = prisma.consentRecord.createMany.mock.calls[0][0].data;
    expect(row).toMatchObject({
      userId: null,
      guestEmail: "g@x.com",
      checkoutGroupId: "group-9",
    });
  });
});

describe("DistanceSalesConsentService.ensureForPayment: trade cash payment", () => {
  const tradePayment = {
    trade: {
      tradeId: "trade-1",
      tradeNumber: "TKS-10001",
      tradeCashPaymentId: "tcp-1",
    },
    userId: "payer-1",
    guestEmail: null,
  };

  it("records the consent bound to the payer's cash payment row", async () => {
    const { service, prisma } = makeService({});

    await expect(service.ensureForPayment(tradePayment, true)).resolves.toBe(
      "record",
    );

    expect(prisma.consentRecord.findFirst.mock.calls[0][0].where).toEqual({
      document: "distance_sales",
      action: "granted",
      OR: [
        {
          OR: [
            { tradeCashPaymentId: "tcp-1" },
            {
              tradeCashPaymentId: null,
              details: { path: ["tradeCashPaymentId"], equals: "tcp-1" },
            },
          ],
        },
      ],
    });
    const { data } = prisma.consentRecord.createMany.mock.calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      document: "distance_sales",
      version: CONSENT_DOCUMENTS.distance_sales.version,
      action: "granted",
      source: ConsentSource.payment,
      userId: "payer-1",
      guestEmail: null,
      orderId: null,
      checkoutGroupId: null,
      tradeCashPaymentId: "tcp-1",
      details: {
        tradeId: "trade-1",
        tradeNumber: "TKS-10001",
        tradeCashPaymentId: "tcp-1",
      },
    });
  });

  it("does not write a second row on a retry of the same cash payment", async () => {
    const { service, prisma } = makeService({
      existing: true,
      setting: "true",
    });

    await expect(service.ensureForPayment(tradePayment, true)).resolves.toBe(
      "proceed",
    );
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });

  it("refuses a trade payment without consent while the setting is on", async () => {
    const { service, prisma } = makeService({ setting: "true" });

    await expect(
      service.ensureForPayment(tradePayment, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });

  it("lets a trade payment without consent go on while the setting is off", async () => {
    const { service, prisma } = makeService({ setting: null });

    await expect(
      service.ensureForPayment(tradePayment, undefined),
    ).resolves.toBe("unrecorded");
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });
});

/**
 * A consent table fake that answers the gate's `findFirst` by evaluating the
 * subset of the Prisma where it uses, and enforces the partial unique index
 * (one granted distance sales row per trade cash payment) on `createMany`.
 */
type StoredRow = Record<string, unknown>;

function matches(row: StoredRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") {
      return (condition as Record<string, unknown>[]).some((w) =>
        matches(row, w),
      );
    }
    if (key === "details") {
      const { path, equals } = condition as { path: string[]; equals: unknown };
      const details = row.details as Record<string, unknown> | null;
      return details != null && details[path[0]] === equals;
    }
    return (row[key] ?? null) === condition;
  });
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the constraint: \`${TRADE_CONSENT_UNIQUE_INDEX}\``,
    {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["trade_cash_payment_id"] },
    },
  );
}

function makeStoreService(rows: StoredRow[] = []) {
  const prisma = {
    consentRecord: {
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          rows.find((row) => matches(row, where)) ?? null,
      ),
      createMany: jest.fn(async ({ data }: { data: StoredRow[] }) => {
        for (const row of data) {
          const guarded =
            row.document === "distance_sales" &&
            row.action === "granted" &&
            row.tradeCashPaymentId != null;
          if (
            guarded &&
            rows.some(
              (r) =>
                r.document === "distance_sales" &&
                r.action === "granted" &&
                r.tradeCashPaymentId === row.tradeCashPaymentId,
            )
          ) {
            throw uniqueViolation();
          }
          rows.push({ id: `consent-${rows.length + 1}`, ...row });
        }
        return { count: data.length };
      }),
    },
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const sentry = { addBreadcrumb: jest.fn() };
  const service = new DistanceSalesConsentService(
    prisma as never,
    new ConsentService(prisma as never),
    sentry as never,
  );
  return { service, prisma, rows, sentry };
}

describe("DistanceSalesConsentService: trade consent bound by the column", () => {
  const tradePayment = (tradeCashPaymentId = "tcp-1") => ({
    trade: { tradeId: "trade-1", tradeNumber: "TKS-10001", tradeCashPaymentId },
    userId: "payer-1",
    guestEmail: null,
  });

  it("finds a row by the column (no second write)", async () => {
    const { service, prisma } = makeStoreService([
      {
        id: "consent-1",
        document: "distance_sales",
        action: "granted",
        tradeCashPaymentId: "tcp-1",
        details: null,
      },
    ]);

    await expect(service.ensureForPayment(tradePayment(), true)).resolves.toBe(
      "proceed",
    );
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });

  it("finds a legacy row (column NULL) through details", async () => {
    const { service, prisma } = makeStoreService([
      {
        id: "consent-1",
        document: "distance_sales",
        action: "granted",
        tradeCashPaymentId: null,
        details: {
          tradeId: "trade-1",
          tradeNumber: "TKS-10001",
          tradeCashPaymentId: "tcp-1",
        },
      },
    ]);

    await expect(service.ensureForPayment(tradePayment(), true)).resolves.toBe(
      "proceed",
    );
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });

  it("does not take another payment's row for this one", async () => {
    const { service, rows } = makeStoreService([
      {
        id: "consent-1",
        document: "distance_sales",
        action: "granted",
        tradeCashPaymentId: "tcp-other",
        details: { tradeCashPaymentId: "tcp-other" },
      },
    ]);

    await expect(service.ensureForPayment(tradePayment(), true)).resolves.toBe(
      "record",
    );
    expect(rows.map((r) => r.tradeCashPaymentId)).toEqual([
      "tcp-other",
      "tcp-1",
    ]);
  });

  it("two concurrent submits write ONE row; the second is 'already recorded'", async () => {
    const { service, prisma, rows, sentry } = makeStoreService();

    // Both lookups run before either write (the race the index closes).
    const outcomes = await Promise.all([
      service.ensureForPayment(tradePayment(), true),
      service.ensureForPayment(tradePayment(), true),
    ]);

    // Two lookups, then the loser's read-back of the winner's row.
    expect(prisma.consentRecord.findFirst).toHaveBeenCalledTimes(3);
    expect(prisma.consentRecord.createMany).toHaveBeenCalledTimes(2);
    expect(outcomes.sort()).toEqual(["proceed", "record"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tradeCashPaymentId: "tcp-1" });
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "consent.distance_sales.proceed",
        data: expect.objectContaining({
          tradeNumber: "TKS-10001",
          tradeCashPaymentId: "tcp-1",
          recordedConcurrently: true,
        }),
      }),
    );
  });

  it("rethrows a trade unique violation when no granted row can be read back", async () => {
    const { service, prisma, rows } = makeStoreService();
    prisma.consentRecord.createMany.mockRejectedValueOnce(uniqueViolation());

    await expect(
      service.ensureForPayment(tradePayment(), true),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    expect(rows).toHaveLength(0);
    // Lookup, then the read-back after the violation.
    expect(prisma.consentRecord.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.consentRecord.findFirst.mock.calls[1][0].where).toEqual({
      document: "distance_sales",
      action: "granted",
      tradeCashPaymentId: "tcp-1",
    });
  });

  it("rethrows a unique violation outside a trade (no silent swallow)", async () => {
    const { service, prisma } = makeStoreService();
    prisma.consentRecord.createMany.mockRejectedValueOnce(uniqueViolation());

    await expect(service.ensureForPayment(offerOrder, true)).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it("rethrows any other write failure of a trade consent", async () => {
    const { service, prisma } = makeStoreService();
    prisma.consentRecord.createMany.mockRejectedValueOnce(
      new Error("connection lost"),
    );

    await expect(
      service.ensureForPayment(tradePayment(), true),
    ).rejects.toThrow("connection lost");
  });

  // Only the unique violation is "already recorded": another failure (here
  // the FK of a cash payment deleted in between) is rethrown even when a
  // granted row of the same payment exists by then, and no read-back runs.
  it("rethrows a non-unique failure even when a granted row exists by then", async () => {
    const { service, prisma, rows } = makeStoreService();
    const fkViolation = new Prisma.PrismaClientKnownRequestError(
      "Foreign key constraint failed",
      {
        code: "P2003",
        clientVersion: "test",
        meta: { field_name: "consent_records_trade_cash_payment_id_fkey" },
      },
    );
    prisma.consentRecord.createMany.mockImplementationOnce(async () => {
      rows.push({
        id: "consent-winner",
        document: "distance_sales",
        action: "granted",
        tradeCashPaymentId: "tcp-1",
        details: null,
      });
      throw fkViolation;
    });

    await expect(service.ensureForPayment(tradePayment(), true)).rejects.toBe(
      fkViolation,
    );
    expect(prisma.consentRecord.findFirst).toHaveBeenCalledTimes(1);
  });

  it("traces the gate outcome with ids and codes only", async () => {
    const { service, sentry } = makeStoreService();

    await service.ensureForPayment(tradePayment(), true);

    const [breadcrumb] = sentry.addBreadcrumb.mock.calls[0];
    expect(breadcrumb).toEqual({
      category: "consent",
      message: "consent.distance_sales.record",
      level: "info",
      data: {
        checkoutGroupId: null,
        orderId: null,
        tradeNumber: "TKS-10001",
        tradeCashPaymentId: "tcp-1",
        recordedConcurrently: false,
      },
    });
  });
});

describe("DistanceSalesConsentService.recordAtCheckout", () => {
  it("checkout transaction'ına sepet bağlı onay yazar", async () => {
    const { service } = makeService({});
    const tx = {
      consentRecord: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    await service.recordAtCheckout(tx as never, {
      checkoutGroupId: "group-1",
      userId: "buyer-1",
      guestEmail: null,
    });

    expect(tx.consentRecord.createMany.mock.calls[0][0].data[0]).toMatchObject({
      document: "distance_sales",
      source: ConsentSource.checkout,
      checkoutGroupId: "group-1",
      userId: "buyer-1",
    });
  });
});
