import { BadRequestException } from "@nestjs/common";
import { ConsentSource } from "@prisma/client";
import {
  CONSENT_DOCUMENTS,
  DISTANCE_SALES_CONSENT_REQUIRED_SETTING,
} from "@tarodan/types";
import { ConsentService } from "./consent.service";
import { DistanceSalesConsentService } from "./distance-sales-consent.service";

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
      OR: [{ details: { path: ["tradeCashPaymentId"], equals: "tcp-1" } }],
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
