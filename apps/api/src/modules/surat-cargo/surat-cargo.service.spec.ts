import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SuratCargoService, SURAT_CARRIER_CLIENT } from "./surat-cargo.service";
import { CacheService } from "../cache/cache.service";
import { SuratTrackingClient } from "./clients/surat-tracking.client";
import type {
  SuratBusinessFailure,
  SuratCreateShipmentInput,
  SuratTechnicalFailure,
} from "./helpers/surat-cargo.types";

/**
 * NÖTR girdi: bu spec servisin sonuç sözleşmesini (Tamam/business/technical,
 * retry, idempotency, takip) ölçer — tel biçimini değil. Alan adları istemcinin
 * içinde kaldığı için Sürat sözleşmesi değiştiğinde bu dosya dokunulmaz.
 */
const baseShipment: SuratCreateShipmentInput = {
  reference: "ORD-1",
  sender: {
    name: "Satan Kisi",
    address: "Depo Mah. Sevk Cad. No:1",
    city: "İstanbul",
    district: "Maltepe",
    phone: "05559876543",
  },
  recipient: {
    name: "Ali Veli",
    address: "Atatürk Cad. No:5",
    city: "İstanbul",
    district: "Kadıköy",
    phone: "05551234567",
  },
};

describe("SuratCargoService", () => {
  let service: SuratCargoService;
  let soapCall: jest.Mock;
  let trackingFetch: jest.Mock;
  let cacheGet: jest.Mock;
  let cacheSet: jest.Mock;
  let cacheDel: jest.Mock;
  let recordLocalCancel: jest.Mock;
  let configGet: jest.Mock;

  beforeEach(async () => {
    soapCall = jest.fn().mockResolvedValue("Tamam");
    trackingFetch = jest.fn().mockResolvedValue({
      IsError: false,
      errorMessage: null,
      Gonderiler: [{ KargoTakipNo: "SURAT-123" }],
    });
    cacheGet = jest.fn().mockResolvedValue(null);
    cacheSet = jest.fn().mockResolvedValue(undefined);
    cacheDel = jest.fn().mockResolvedValue(undefined);
    recordLocalCancel = jest.fn();
    configGet = jest.fn((key: string, defaultValue?: string) => {
      if (key === "SURAT_CARGO_MAX_RETRIES") return "3";
      if (key === "SURAT_CARGO_RETRY_BASE_MS") return "1";
      if (key === "SURAT_SOAP_TIMEOUT_MS") return "5000";
      return defaultValue;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuratCargoService,
        {
          provide: SURAT_CARRIER_CLIENT,
          useValue: {
            callCreateShipment: soapCall,
            getLocalTrackingCode: () => null,
            recordLocalCancel,
          },
        },
        {
          provide: SuratTrackingClient,
          useValue: {
            lookupTracking: jest.fn(async (ref: string) => {
              const data = await trackingFetch(ref);
              return data
                ? { kind: "found", data }
                : { kind: "pending", message: "Kargo kabul bekleniyor" };
            }),
          },
        },
        {
          provide: CacheService,
          useValue: { get: cacheGet, set: cacheSet, del: cacheDel },
        },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get(SuratCargoService);
  });

  it("returns success only when response is exactly Tamam (trimmed)", async () => {
    soapCall.mockResolvedValue("Tamam");
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: "k1",
      correlationId: "c1",
      shipment: baseShipment,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.suratMessage).toBe("Tamam");
    expect(cacheSet).toHaveBeenCalled();
  });

  it("treats non-Tamam string as business failure", async () => {
    soapCall.mockResolvedValue("Kullanıcı adı veya şifre hatalı");
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: "k2",
      correlationId: "c2",
      shipment: baseShipment,
    });
    expect(r.ok).toBe(false);
    const b = r as SuratBusinessFailure;
    expect(b.kind).toBe("business");
    expect(b.suratMessage).toContain("hatalı");
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it("returns EMPTY_RESPONSE for a blank create response", async () => {
    soapCall.mockResolvedValue("   ");
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: "k3",
      correlationId: "c3",
      shipment: baseShipment,
    });
    expect(r.ok).toBe(false);
    expect((r as SuratTechnicalFailure).code).toBe("EMPTY_RESPONSE");
  });

  it("classifies HTTP 500 as HTTP_5XX", async () => {
    const err = new Error("Internal");
    (err as any).statusCode = 500;
    soapCall.mockRejectedValue(err);
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: "k4b",
      correlationId: "c4b",
      shipment: baseShipment,
    });
    expect(r.ok).toBe(false);
    expect((r as SuratTechnicalFailure).code).toBe("HTTP_5XX");
  });

  it("classifies ETIMEDOUT as TIMEOUT", async () => {
    const err = new Error("timed out");
    (err as NodeJS.ErrnoException).code = "ETIMEDOUT";
    soapCall.mockRejectedValue(err);
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: "k4",
      correlationId: "c4",
      shipment: baseShipment,
    });
    expect(r.ok).toBe(false);
    expect((r as SuratTechnicalFailure).code).toBe("TIMEOUT");
  });

  it("returns cached success without calling create again", async () => {
    cacheGet.mockResolvedValue({
      ok: true,
      suratMessage: "Tamam",
      correlationId: "old",
      idempotencyKey: "idem",
    });
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: "idem",
      correlationId: "new-corr",
      shipment: baseShipment,
    });
    expect(r.ok).toBe(true);
    expect(soapCall).not.toHaveBeenCalled();
  });

  it("retries technical failure then succeeds", async () => {
    let n = 0;
    soapCall.mockImplementation(async () => {
      n += 1;
      if (n < 2) {
        const e = new Error("e");
        (e as NodeJS.ErrnoException).code = "ECONNRESET";
        throw e;
      }
      return "Tamam";
    });
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: "k5",
      correlationId: "c5",
      shipment: baseShipment,
    });
    expect(r.ok).toBe(true);
    expect(soapCall).toHaveBeenCalledTimes(2);
  });

  it("does not retry business failure", async () => {
    soapCall.mockResolvedValue("Adres eksik");
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: "k6",
      correlationId: "c6",
      shipment: baseShipment,
    });
    expect(r.ok).toBe(false);
    expect(soapCall).toHaveBeenCalledTimes(1);
  });

  it("treats the documented duplicate-shipment response as idempotent success", async () => {
    soapCall.mockResolvedValue("Bu Siparişe Ait Gönderi Oluşmuştur");

    const result = await service.submitShipmentWithRetry({
      idempotencyKey: "duplicate",
      correlationId: "duplicate",
      shipment: baseShipment,
    });

    expect(result.ok).toBe(true);
    expect(soapCall).toHaveBeenCalledTimes(1);
  });

  it("creates with the documented endpoint then resolves the code from tracking", async () => {
    const result = await service.createShipmentWithBarcode({
      idempotencyKey: "create-track",
      correlationId: "create-track",
      shipment: baseShipment,
    });

    expect(result.ok).toBe(true);
    expect(soapCall).toHaveBeenCalledTimes(1);
    expect(trackingFetch).toHaveBeenCalledWith("ORD-1");
    if (result.ok) {
      expect(result.kargoTakipNo).toBe("SURAT-123");
      expect(result.labelZpl).toBeNull();
    }
  });

  it("hands the carrier client both parties untouched — wire mapping is the client's job", async () => {
    const sender = {
      name: "Satan Kisi",
      address: "Depo Mah. Sevk Cad. No:1",
      city: "İstanbul",
      district: "Maltepe",
      phone: "05559876543",
    };
    const recipient = {
      name: "Ayşe Kaya",
      address: "Adres 1",
      city: "İstanbul",
      district: "Kadıköy",
      phone: "05551112233",
    };

    const result = await service.createShipment({
      idempotencyKey: "neutral-create",
      correlationId: "neutral-create",
      reference: "PKG-42",
      sender,
      recipient,
      content: "Ürün",
      desi: 4,
      isReturn: true,
    });

    expect(result).toEqual({
      ok: true,
      trackingCode: "SURAT-123",
      labelData: null,
      providerMessage: "Tamam",
    });
    // Servis alan adı bilmez: idempotencyKey/correlationId'yi ayırıp gönderinin
    // kendisini olduğu gibi iletir. `sender` buradan geçmezse pazaryeri
    // migrasyonunun tamamı sessizce çalışmaz.
    expect(soapCall).toHaveBeenCalledWith(
      {
        reference: "PKG-42",
        sender,
        recipient,
        content: "Ürün",
        desi: 4,
        isReturn: true,
      },
      expect.any(Object),
    );
  });

  it("returns TRACKING_PENDING while the documented tracking record is not visible yet", async () => {
    trackingFetch.mockResolvedValue(null);

    const result = await service.createShipmentWithBarcode({
      idempotencyKey: "barcode-empty",
      correlationId: "barcode-empty",
      shipment: baseShipment,
    });

    expect(result.ok).toBe(false);
    expect((result as SuratTechnicalFailure).code).toBe("TRACKING_PENDING");
    expect(soapCall).toHaveBeenCalledTimes(1);
    expect(trackingFetch).toHaveBeenCalledTimes(1);
  });

  it("exposes a successful provider registration before branch acceptance", async () => {
    trackingFetch.mockResolvedValue(null);

    await expect(
      service.createShipment({
        idempotencyKey: "registered-pending",
        correlationId: "registered-pending",
        reference: "PKG-PENDING",
        sender: baseShipment.sender,
        recipient: baseShipment.recipient,
      }),
    ).resolves.toEqual({
      ok: true,
      trackingCode: null,
      labelData: null,
      providerMessage: "registered_pending_carrier_acceptance",
    });
  });

  it("cancels only local state and never calls a carrier cancel endpoint", async () => {
    configGet.mockImplementation((key: string, defaultValue?: string) => {
      if (key === "SURAT_CARGO_ENABLED") return "true";
      return defaultValue;
    });

    await expect(service.cancelShipmentLocally("ORD-1")).resolves.toEqual({
      ok: true,
      suratMessage: "remote_cancel_unsupported_local_only",
    });
    expect(recordLocalCancel).toHaveBeenCalledWith("ORD-1");
    expect(cacheDel).toHaveBeenCalledTimes(2);
    expect(soapCall).not.toHaveBeenCalled();
    expect(trackingFetch).not.toHaveBeenCalled();
  });

  it("keeps local cancellation successful if cache cleanup fails", async () => {
    configGet.mockImplementation((key: string, defaultValue?: string) => {
      if (key === "SURAT_CARGO_ENABLED") return "true";
      return defaultValue;
    });
    cacheDel.mockRejectedValue(new Error("redis unavailable"));

    await expect(service.cancelShipmentLocally("ORD-2")).resolves.toEqual({
      ok: true,
      suratMessage: "remote_cancel_unsupported_local_only",
    });
    expect(recordLocalCancel).toHaveBeenCalledWith("ORD-2");
    expect(soapCall).not.toHaveBeenCalled();
  });
});
