import { ElogoDeliveryService } from "../elogo-delivery.service";
import {
  ELOGO_MAX_SEND_ATTEMPTS,
  isConfigurationElogoFailure,
  isTransientElogoFailure,
} from "./elogo-retry-policy";

/**
 * HIGH: `MAX_SEND_ATTEMPTS = 8` + 30 dakikalık cron ≈ 4 saatlik deneme bütçesi.
 * Zaman aşımı gibi GEÇİCİ hatalar da bu bütçeden yediği için sağlayıcı ~4 saatten
 * uzun kapalı kalırsa fatura kalıcı olarak `failed`'de kalıyordu: admin API salt
 * okunur (retry endpoint'i yok) ve `failed` kayıtları izleyen hiçbir alarm yok →
 * sessiz 7 gün ihlali, düzeltmek için DB müdahalesi gerekiyor.
 */
describe("eLogo retry policy — transient failures do not burn the budget", () => {
  it("ağ/zaman aşımı hataları GEÇİCİ sayılır", () => {
    expect(isTransientElogoFailure(new Error("ETIMEDOUT"))).toBe(true);
    expect(isTransientElogoFailure(new Error("socket hang up"))).toBe(true);
    expect(isTransientElogoFailure(new Error("ECONNREFUSED"))).toBe(true);
    expect(isTransientElogoFailure(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientElogoFailure(new Error("Gateway Timeout"))).toBe(true);
    expect(isTransientElogoFailure(new Error("503 Service Unavailable"))).toBe(
      true,
    );
  });

  it("iş kuralı/doğrulama hataları KALICI sayılır (sonsuza dek denenmemeli)", () => {
    expect(isTransientElogoFailure(new Error("VKN gecersiz"))).toBe(false);
    expect(isTransientElogoFailure(new Error("mukellef bulunamadi"))).toBe(
      false,
    );
    expect(isTransientElogoFailure(undefined)).toBe(false);
  });

  it("deneme üst sınırı tek kaynaktan gelir", () => {
    expect(ELOGO_MAX_SEND_ATTEMPTS).toBeGreaterThan(0);
  });

  /**
   * Sentry TARODAN-API-13: "XSLT tasarım hatası … GetXsltDocument fail!" hesaba
   * özgü bir yapılandırma reddidir; 8 deneme × 30 dk boyunca sessizce denendi.
   */
  it("XSLT/tasarım reddi YAPILANDIRMA hatası sayılır, belge reddi sayılmaz", () => {
    expect(
      isConfigurationElogoFailure(
        "XSLT tasarım hatası. (id: 326502, uuid: B85241B4) (GetXsltDocument fail! Document not found.)",
      ),
    ).toBe(true);
    expect(isConfigurationElogoFailure("VKN gecersiz")).toBe(false);
    expect(isConfigurationElogoFailure(null)).toBe(false);
  });
});

/**
 * Kalıcı hatayla bütçesi tükenen faturalar İZLENEBİLİR olmalı ve admin
 * müdahalesiyle yeniden denenebilmelidir.
 */
describe("ElogoInvoicingService — exhausted invoice recovery", () => {
  const makeService = (
    rows: any[],
    opts: { notifications?: { alreadyAlerted: boolean } } = {},
  ) => {
    const updates: any[] = [];
    const notifyAllAdminsOnce = jest
      .fn()
      .mockResolvedValue(!opts.notifications?.alreadyAlerted);
    const prisma = {
      elogoInvoice: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(rows.length),
        findUnique: jest.fn().mockResolvedValue(rows[0] ?? null),
        update: jest.fn().mockImplementation((arg: any) => {
          updates.push(arg);
          return Promise.resolve({ ...rows[0], ...arg.data });
        }),
      },
    };
    // Gönderim bütçesi ve deneme sayacı ElogoDeliveryService'in işi; spec de
    // onu doğrudan kurar (facade üzerinden gitmek casusu delege nesnenin
    // DIŞINDA bırakırdı).
    const service = new ElogoDeliveryService(
      prisma as any,
      { isEnabled: () => true } as any,
      {} as any, // documents
      undefined,
      undefined,
      opts.notifications ? ({ notifyAllAdminsOnce } as any) : undefined,
    );
    const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    (service as any).logger = logger;
    return { service, prisma, updates, logger, notifyAllAdminsOnce };
  };

  /**
   * Sentry TARODAN-API-13: aynı beş belge 30 dakikada bir Sentry'ye düşüyordu.
   * Belge başına 24 saatte bir admin bildirimi + error; sonrası warn.
   */
  it("tükenmiş belge admin'e bir kez bildirilir, tekrar turlarında error yazılmaz", async () => {
    const row = {
      id: "inv-1",
      invoiceNumber: "TRD2026000000256",
      status: "failed",
      attemptCount: ELOGO_MAX_SEND_ATTEMPTS,
      type: "trade_service_fee",
      sourceId: "tcp-1",
      elogoResultMsg: "XSLT tasarım hatası.",
    };
    const first = makeService([row], {
      notifications: { alreadyAlerted: false },
    });
    expect(await first.service.reportExhaustedInvoices()).toBe(1);
    expect(first.notifyAllAdminsOnce).toHaveBeenCalledWith(
      "elogo-exhausted:inv-1",
      24 * 60 * 60,
      expect.any(String),
      expect.objectContaining({ invoiceNumber: "TRD2026000000256" }),
    );
    expect(first.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("ELOGO_INVOICE_EXHAUSTED"),
    );

    const repeat = makeService([row], {
      notifications: { alreadyAlerted: true },
    });
    expect(await repeat.service.reportExhaustedInvoices()).toBe(1);
    expect(repeat.logger.error).not.toHaveBeenCalled();
    expect(repeat.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("daha önce bildirildi"),
    );
  });

  it("bütçesi tükenmiş faturalar alarm olarak raporlanır", async () => {
    const { service, logger } = makeService([
      {
        id: "inv-1",
        invoiceNumber: "TRD001",
        status: "failed",
        attemptCount: ELOGO_MAX_SEND_ATTEMPTS,
        type: "commission",
        sourceId: "order-1",
      },
    ]);

    const exhausted = await service.reportExhaustedInvoices();

    expect(exhausted).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("ELOGO_INVOICE_EXHAUSTED"),
    );
  });

  it("tükenmiş fatura yoksa alarm verilmez", async () => {
    const { service, logger } = makeService([]);

    const exhausted = await service.reportExhaustedInvoices();

    expect(exhausted).toBe(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("admin deneme sayacını sıfırlayarak yeniden gönderim başlatabilir", async () => {
    const { service, updates } = makeService([
      {
        id: "inv-1",
        invoiceNumber: "TRD001",
        status: "failed",
        attemptCount: ELOGO_MAX_SEND_ATTEMPTS,
      },
    ]);
    jest
      .spyOn(service as any, "sendRecord")
      .mockResolvedValue(undefined as never);

    await service.resetInvoiceAttempts("inv-1");

    const reset = updates.find((u: any) => u.data?.attemptCount === 0);
    expect(reset).toBeDefined();
    expect(reset.data.status).toBe("pending");
  });
});
