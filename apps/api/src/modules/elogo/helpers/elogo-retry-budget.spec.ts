import { ElogoInvoicingService } from "../elogo-invoicing.service";
import {
  ELOGO_MAX_SEND_ATTEMPTS,
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
});

/**
 * Kalıcı hatayla bütçesi tükenen faturalar İZLENEBİLİR olmalı ve admin
 * müdahalesiyle yeniden denenebilmelidir.
 */
describe("ElogoInvoicingService — exhausted invoice recovery", () => {
  const makeService = (rows: any[]) => {
    const updates: any[] = [];
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
    const service = new ElogoInvoicingService(
      prisma as any,
      { isEnabled: () => true } as any,
      { get: () => undefined } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    (service as any).logger = logger;
    return { service, prisma, updates, logger };
  };

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
