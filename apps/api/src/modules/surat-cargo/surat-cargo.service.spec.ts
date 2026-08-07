import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SuratCargoService, SURAT_CARRIER_CLIENT } from "./surat-cargo.service";
import { CacheService } from "../cache/cache.service";
import { SuratTrackingClient } from "./surat-tracking.client";
import type {
  SuratBusinessFailure,
  SuratGonderiPayload,
  SuratTechnicalFailure,
} from "./surat-cargo.types";
import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
} from "./surat-cargo.types";

const basePayload: SuratGonderiPayload = {
  KisiKurum: "Ali Veli",
  AliciAdresi: "Atatürk Cad. No:5",
  Il: "İstanbul",
  Ilce: "Kadıköy",
  TelefonCep: "05551234567",
  KargoTuru: SuratKargoTuru.Koli,
  OdemeTipi: SuratOdemeTipi.Pesin,
  OzelKargoTakipNo: "ORD-1",
  Adet: 1,
  BirimDesi: 1,
  BirimKg: 1,
  KapidanOdemeTahsilatTipi: 1,
  TasimaSekli: SuratTasimaSekli.KaraYolu,
  TeslimSekli: SuratTeslimSekli.AdreseTeslim,
  GonderiSekli: SuratGonderiSekli.Standart,
  Pazaryerimi: 0,
  Iademi: false,
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
            callGonderiyiKargoyaGonder: soapCall,
            getLocalTrackingCode: () => null,
            recordLocalCancel,
          },
        },
        {
          provide: SuratTrackingClient,
          useValue: { fetchTrackingInfo: trackingFetch },
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
      payload: basePayload,
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
      payload: basePayload,
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
      payload: basePayload,
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
      payload: basePayload,
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
      payload: basePayload,
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
      payload: basePayload,
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
      payload: basePayload,
    });
    expect(r.ok).toBe(true);
    expect(soapCall).toHaveBeenCalledTimes(2);
  });

  it("does not retry business failure", async () => {
    soapCall.mockResolvedValue("Adres eksik");
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: "k6",
      correlationId: "c6",
      payload: basePayload,
    });
    expect(r.ok).toBe(false);
    expect(soapCall).toHaveBeenCalledTimes(1);
  });

  it("treats the documented duplicate-shipment response as idempotent success", async () => {
    soapCall.mockResolvedValue("Bu Siparişe Ait Gönderi Oluşmuştur");

    const result = await service.submitShipmentWithRetry({
      idempotencyKey: "duplicate",
      correlationId: "duplicate",
      payload: basePayload,
    });

    expect(result.ok).toBe(true);
    expect(soapCall).toHaveBeenCalledTimes(1);
  });

  it("creates with the documented endpoint then resolves the code from tracking", async () => {
    const result = await service.createShipmentWithBarcode({
      idempotencyKey: "create-track",
      correlationId: "create-track",
      payload: basePayload,
    });

    expect(result.ok).toBe(true);
    expect(soapCall).toHaveBeenCalledTimes(1);
    expect(trackingFetch).toHaveBeenCalledWith("ORD-1");
    if (result.ok) {
      expect(result.kargoTakipNo).toBe("SURAT-123");
      expect(result.labelZpl).toBeNull();
    }
  });

  it("maps the provider-neutral shipment port to the documented Surat payload", async () => {
    const result = await service.createShipment({
      idempotencyKey: "neutral-create",
      correlationId: "neutral-create",
      reference: "PKG-42",
      recipient: {
        name: "  Ayşe Kaya  ",
        address: "Adres 1",
        city: " İstanbul ",
        district: " Kadıköy ",
        phone: "+90 555 111 22 33",
      },
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
    expect(soapCall).toHaveBeenCalledWith(
      expect.objectContaining({
        OzelKargoTakipNo: "PKG-42",
        KisiKurum: "Ayşe Kaya",
        Il: "İstanbul",
        Ilce: "Kadıköy",
        TelefonCep: "05551112233",
        BirimDesi: 4,
        Iademi: true,
      }),
      expect.any(Object),
    );
  });

  it("returns TRACKING_PENDING while the documented tracking record is not visible yet", async () => {
    trackingFetch.mockResolvedValue(null);

    const result = await service.createShipmentWithBarcode({
      idempotencyKey: "barcode-empty",
      correlationId: "barcode-empty",
      payload: basePayload,
    });

    expect(result.ok).toBe(false);
    expect((result as SuratTechnicalFailure).code).toBe("TRACKING_PENDING");
    expect(soapCall).toHaveBeenCalledTimes(1);
    expect(trackingFetch).toHaveBeenCalledTimes(1);
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
