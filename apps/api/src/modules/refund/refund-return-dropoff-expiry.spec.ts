import { RefundRequestStatus } from "@prisma/client";
import { RefundShipmentService } from "./refund-shipment.service";
import { warehouseAddressStub } from "../shipping/testing/warehouse-address-fixture";
import type { SuratTrackingLookupResult } from "../surat-cargo/helpers/surat-cargo.types";

/**
 * D25 süre-aşımı: iade açıldı ama koli hiç şubeye götürülmedi.
 *
 * Canlı olay (2026-09-10): RFD-M3Z95VHBCP ve RFD-MCT8KZ644D 31 gündür
 * `return_shipment_open`'da duruyordu. Sürat, hiç kabul edilmemiş bir barkod
 * için `pending` döndürüyor; eski kod bunu `fetchTrackingInfo()` üzerinden
 * `null`'a indirip "belirsizlik" sayıyor ve `continue` ediyordu. Sonuç:
 * satıcının hold'u donuk, sipariş `delivered`de çakılı, iade hiç sonuçlanmıyor.
 */
describe("RefundShipmentService — expireStaleOpenReturns", () => {
  const OLD = new Date("2026-08-10T11:38:32.802Z");

  const makeService = (
    lookup: SuratTrackingLookupResult,
    returnCreatedAt: Date = OLD,
  ) => {
    const prisma = {
      refundRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "rr-1",
            refundNumber: "RFD-MCT8KZ644D",
            requesterId: "buyer-1",
            returnCreatedAt,
            order: { id: "order-1", sellerId: "seller-1" },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const carrierCancellations = {
      request: jest.fn().mockImplementation(async (input: any) => {
        await input.updateLocal(prisma);
        return { id: "task-1" };
      }),
    };
    const suratTrackingService = {
      lookupTracking: jest.fn().mockResolvedValue(lookup),
      // Eski yol: bir daha kullanılmadığını ispatlamak için stub'lanır.
      fetchTrackingInfo: jest.fn(),
    };
    const notifications = {
      appendHistory: jest.fn().mockResolvedValue(undefined),
      safeNotify: jest.fn().mockResolvedValue(undefined),
    };
    const financials = {
      unfreezeHoldForRefund: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RefundShipmentService(
      prisma as any,
      {} as any,
      {} as any,
      carrierCancellations as any,
      suratTrackingService as any,
      notifications as any,
      financials as any,
      warehouseAddressStub() as any,
    );
    return {
      service,
      prisma,
      carrierCancellations,
      suratTrackingService,
      notifications,
      financials,
    };
  };

  it("Sürat kabul beklerken (pending) iadeyi iptal eder ve hold kilidini kaldırır", async () => {
    const { service, prisma, carrierCancellations, notifications, financials } =
      makeService({ kind: "pending", message: "kargo kabul bekleniyor" });

    await expect(service.expireStaleOpenReturns()).resolves.toBe(1);

    expect(carrierCancellations.request).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "return_dropoff_expired",
        metadata: expect.objectContaining({
          expiryReason: "no_carrier_record",
        }),
      }),
    );
    expect(prisma.refundRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RefundRequestStatus.cancelled,
          decidedBy: "system",
        }),
      }),
    );
    expect(financials.unfreezeHoldForRefund).toHaveBeenCalledWith("order-1");
    expect(notifications.appendHistory).toHaveBeenCalledWith(
      "rr-1",
      expect.objectContaining({
        action: "return_dropoff_expired",
        details: expect.objectContaining({ expiryReason: "no_carrier_record" }),
      }),
    );
    // Bildirim ALICIYA gider — talebi o açtı.
    expect(notifications.safeNotify).toHaveBeenCalledWith(
      "buyer-1",
      expect.anything(),
      expect.objectContaining({ audience: "buyer" }),
    );
  });

  it("taşıyıcıda iptal edilmiş etiketi de kapatır", async () => {
    const { service, carrierCancellations } = makeService({
      kind: "cancelled",
      message: "Gönderi iptal edilmiştir.",
    });

    await expect(service.expireStaleOpenReturns()).resolves.toBe(1);
    expect(carrierCancellations.request).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          expiryReason: "carrier_cancelled",
        }),
      }),
    );
  });

  it("pakette hareket varsa dokunmaz", async () => {
    const { service, carrierCancellations, financials } = makeService({
      kind: "found",
      data: {
        IsError: false,
        errorMessage: null,
        Gonderiler: [{ KargonunDurumuSayi: 4, Hareketler: [] } as any],
      },
    });

    await expect(service.expireStaleOpenReturns()).resolves.toBe(0);
    expect(carrierCancellations.request).not.toHaveBeenCalled();
    expect(financials.unfreezeHoldForRefund).not.toHaveBeenCalled();
  });

  it("sorgu hatasında bekler (belirsizlik) — emniyet supabı dolmadıysa", async () => {
    const { service, carrierCancellations } = makeService(
      { kind: "failure", category: "timeout", message: "timed out" },
      // Normal pencereyi geçmiş ama hard cutoff'a girmemiş.
      new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    );

    await expect(service.expireStaleOpenReturns()).resolves.toBe(0);
    expect(carrierCancellations.request).not.toHaveBeenCalled();
  });

  it("sorgu hatası sürse bile emniyet supabı dolunca kapatır", async () => {
    const { service, carrierCancellations } = makeService(
      { kind: "failure", category: "network", message: "ECONNRESET" },
      new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    );

    await expect(service.expireStaleOpenReturns()).resolves.toBe(1);
    expect(carrierCancellations.request).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          expiryReason: "unverifiable_hard_timeout",
        }),
      }),
    );
  });

  it("adayları yalnız surat + return_shipment_open + süresi dolmuş kayıtlardan seçer", async () => {
    const { service, prisma } = makeService({
      kind: "pending",
      message: "kargo kabul bekleniyor",
    });

    await service.expireStaleOpenReturns();

    expect(prisma.refundRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: RefundRequestStatus.return_shipment_open,
          returnProvider: "surat",
          returnCreatedAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });
});
