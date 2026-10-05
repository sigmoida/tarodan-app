import { BadRequestException } from "@nestjs/common";
import { ConsentAction, ConsentSource } from "@prisma/client";
import {
  ACCOUNT_REQUIRED_CONSENTS,
  CONSENT_DOCUMENTS,
  GATEWAY_CLIENT_IP_HEADER,
} from "@tarodan/types";
import { requestIdMiddleware } from "../../common/context/request-context";
import { ConsentService } from "./consent.service";

function makeService(history: Record<string, unknown>[] = []) {
  const prisma = {
    consentRecord: {
      createMany: jest
        .fn()
        .mockImplementation(({ data }: { data: unknown[] }) =>
          Promise.resolve({ count: data.length }),
        ),
      findMany: jest.fn().mockResolvedValue(history),
    },
  };
  return { service: new ConsentService(prisma as never), prisma };
}

/** Servisi gerçek bir HTTP isteğinin bağlamında çalıştırır (kanıt alanları). */
function withRequest<T>(
  req: { ip?: string; headers: Record<string, string> },
  fn: () => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    requestIdMiddleware(
      req as never,
      { setHeader: () => undefined } as never,
      () => {
        fn().then(resolve, reject);
      },
    );
  });
}

const rowsOf = (prisma: ReturnType<typeof makeService>["prisma"]) =>
  prisma.consentRecord.createMany.mock.calls.flatMap(
    (call: [{ data: Record<string, unknown>[] }]) => call[0].data,
  );

describe("ConsentService.record", () => {
  it("sürümü belge kataloğundan, kanıtı istek bağlamından damgalar", async () => {
    const { service, prisma } = makeService();

    await withRequest(
      {
        ip: "10.0.0.3",
        headers: {
          [GATEWAY_CLIENT_IP_HEADER]: "85.105.10.20",
          "user-agent": "Mozilla/5.0 test",
        },
      },
      () =>
        service.record([
          {
            document: "kvkk",
            source: ConsentSource.registration,
            subject: { userId: "u1" },
          },
        ]),
    );

    expect(rowsOf(prisma)).toEqual([
      expect.objectContaining({
        document: "kvkk",
        version: CONSENT_DOCUMENTS.kvkk.version,
        action: ConsentAction.granted,
        source: ConsentSource.registration,
        userId: "u1",
        ipAddress: "85.105.10.20",
        userAgent: "Mozilla/5.0 test",
      }),
    ]);
  });

  it("verilen transaction istemcisine yazar (ör. kayıt transaction'ı)", async () => {
    const { service, prisma } = makeService();
    const tx = {
      consentRecord: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    await service.record(
      [
        {
          document: "terms",
          source: ConsentSource.registration,
          subject: { userId: "u1" },
        },
      ],
      tx as never,
    );

    expect(tx.consentRecord.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });

  it("sahibi olmayan kaydı reddeder (programlama hatası)", async () => {
    const { service } = makeService();

    await expect(
      service.record([
        { document: "terms", source: ConsentSource.registration, subject: {} },
      ]),
    ).rejects.toThrow(/without a subject/);
  });

  it("misafir e-postasını küçük harfe indirir", async () => {
    const { service, prisma } = makeService();

    await service.record([
      {
        document: "distance_sales",
        source: ConsentSource.checkout,
        subject: { guestEmail: "  Guest@Example.COM " },
        checkoutGroupId: "g1",
      },
    ]);

    expect(rowsOf(prisma)[0]).toMatchObject({
      guestEmail: "guest@example.com",
      userId: null,
      checkoutGroupId: "g1",
    });
  });
});

describe("ConsentService.recordAccountConsents", () => {
  it("terms, privacy ve kvkk için AYRI satırlar yazar", async () => {
    const { service, prisma } = makeService();

    const count = await service.recordAccountConsents(
      "u1",
      ["terms", "privacy", "kvkk"],
      ConsentSource.registration,
    );

    expect(count).toBe(3);
    expect(
      rowsOf(prisma)
        .map((r) => r.document)
        .sort(),
    ).toEqual(["kvkk", "privacy", "terms"]);
  });

  it("onay göndermeyen eski mobil kaydı satır üretmez (kapı ilk girişte ister)", async () => {
    const { service, prisma } = makeService();

    await expect(
      service.recordAccountConsents(
        "u1",
        undefined,
        ConsentSource.registration,
      ),
    ).resolves.toBe(0);
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });

  it("zorunlu olmayan anahtarları hesap onayı olarak yazmaz", async () => {
    const { service, prisma } = makeService();

    await service.recordAccountConsents(
      "u1",
      ["terms", "distance_sales", "marketing"],
      ConsentSource.registration,
    );

    expect(rowsOf(prisma).map((r) => r.document)).toEqual(["terms"]);
  });
});

describe("ConsentService.acceptPending (yeniden-onay kapısı)", () => {
  const current = (doc: keyof typeof CONSENT_DOCUMENTS) => ({
    document: doc,
    version: CONSENT_DOCUMENTS[doc].version,
    action: "granted",
    createdAt: new Date("2026-09-01T00:00:00Z"),
  });

  it("yalnız bekleyen belgeleri yazar ve kalan bekleyenleri döner", async () => {
    // terms güncel; privacy ve kvkk hiç onaylanmamış.
    const { service, prisma } = makeService([current("terms")]);

    const remaining = await service.acceptPending("u1", ["terms", "privacy"]);

    expect(rowsOf(prisma).map((r) => r.document)).toEqual(["privacy"]);
    expect(rowsOf(prisma)[0]).toMatchObject({
      source: ConsentSource.consent_prompt,
      userId: "u1",
    });
    expect(remaining.map((p) => p.document)).toEqual(["kvkk"]);
  });

  it("sürümü değişen belgeyi yeniden onaylatır", async () => {
    const { service, prisma } = makeService([
      { ...current("terms"), version: "2020-01-01" },
      current("privacy"),
      current("kvkk"),
    ]);

    const remaining = await service.acceptPending("u1", ["terms"]);

    expect(rowsOf(prisma)).toEqual([
      expect.objectContaining({
        document: "terms",
        version: CONSENT_DOCUMENTS.terms.version,
      }),
    ]);
    expect(remaining).toEqual([]);
  });

  it("hesap için zorunlu olmayan belge kapıdan onaylanamaz", async () => {
    const { service } = makeService();

    await expect(
      service.acceptPending("u1", ["distance_sales"]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("her şey güncelse hiçbir satır yazmaz (çift gönderim zararsız)", async () => {
    const { service, prisma } = makeService(
      ACCOUNT_REQUIRED_CONSENTS.map((doc) => current(doc)),
    );

    await expect(
      service.acceptPending("u1", [...ACCOUNT_REQUIRED_CONSENTS]),
    ).resolves.toEqual([]);
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });
});

describe("ConsentService.recordCookiePreferences", () => {
  it("giriş yapmamış ziyaretçiyi ziyaretçi kimliği + IP + kullanıcı ajanıyla kaydeder", async () => {
    const { service, prisma } = makeService();

    await withRequest(
      { ip: "31.200.1.1", headers: { "user-agent": "Safari" } },
      () =>
        service.recordCookiePreferences({
          visitorId: "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
          preferences: { functional: false, analytics: true, marketing: false },
        }),
    );

    expect(rowsOf(prisma)[0]).toMatchObject({
      document: "cookies",
      version: CONSENT_DOCUMENTS.cookies.version,
      source: ConsentSource.cookie_banner,
      action: ConsentAction.granted,
      visitorId: "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
      userId: null,
      ipAddress: "31.200.1.1",
      userAgent: "Safari",
      details: { functional: false, analytics: true, marketing: false },
    });
  });

  it("oturum varsa kaydı üyeye de bağlar", async () => {
    const { service, prisma } = makeService();

    await service.recordCookiePreferences({
      visitorId: "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
      userId: "u1",
      preferences: { functional: true, analytics: true, marketing: true },
    });

    expect(rowsOf(prisma)[0]).toMatchObject({ userId: "u1" });
  });

  it("tüm isteğe bağlı kategoriler kapalıysa onay 'withdrawn' olur", async () => {
    const { service, prisma } = makeService();

    await service.recordCookiePreferences({
      visitorId: "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
      preferences: { functional: false, analytics: false, marketing: false },
    });

    expect(rowsOf(prisma)[0]).toMatchObject({
      action: ConsentAction.withdrawn,
    });
  });
});

describe("ConsentService.recordMarketingChange", () => {
  it("izin verme ve geri çekmeyi tarihli ayrı satırlar olarak yazar", async () => {
    const { service, prisma } = makeService();

    await service.recordMarketingChange({
      userId: "u1",
      granted: true,
      source: ConsentSource.registration,
    });
    await service.recordMarketingChange({
      userId: "u1",
      granted: false,
      source: ConsentSource.account_settings,
    });

    expect(rowsOf(prisma).map((r) => [r.document, r.action, r.source])).toEqual(
      [
        ["marketing", ConsentAction.granted, ConsentSource.registration],
        ["marketing", ConsentAction.withdrawn, ConsentSource.account_settings],
      ],
    );
  });
});

describe("ConsentService.getStatus", () => {
  it("her belge için en son kaydı ve bekleme durumunu döner", async () => {
    const { service } = makeService([
      {
        document: "terms",
        version: CONSENT_DOCUMENTS.terms.version,
        action: "granted",
        source: "registration",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

    const status = await service.getStatus("u1");
    const byDoc = new Map(status.map((s) => [s.document, s]));

    expect(byDoc.get("terms")).toMatchObject({
      pending: false,
      latest: { version: CONSENT_DOCUMENTS.terms.version },
    });
    expect(byDoc.get("kvkk")).toMatchObject({ pending: true, latest: null });
    // Zorunlu olmayan belge hiçbir zaman "bekliyor" sayılmaz.
    expect(byDoc.get("marketing")).toMatchObject({ pending: false });
  });
});
