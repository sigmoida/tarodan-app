import { ShipmentStatus } from "@prisma/client";
import { RefundReturnTrackingSyncService } from "./refund-return-tracking-sync.service";

describe("RefundReturnTrackingSyncService", () => {
  const makeService = (
    code: number,
    gonderiOverrides: Record<string, unknown> = {},
  ) => {
    const refundRequest = {
      id: "refund-1",
      returnProvider: "surat",
      returnTrackingNumber: "RETURN-REF-1",
      returnProviderTrackingId: null,
      returnShippedAt: null,
    };
    const prisma = {
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue(refundRequest),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const refundService = {
      applyReturnTrackingUpdate: jest.fn().mockResolvedValue(undefined),
      finalizeRefund: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = {
      get: jest.fn().mockReturnValue(refundService),
    };
    const client = {
      lookupTracking: jest.fn().mockResolvedValue({
        kind: "found",
        data: {
          Gonderiler: [
            {
              KargonunDurumuSayi: code,
              KargonunDurumu: `status-${code}`,
              KargoTakipNo: "RETURN-CARGO-CODE",
              TeslimTarihi: code === 12 ? "28.07.2026 12:00:00" : "",
              ...gonderiOverrides,
            },
          ],
        },
      }),
      parseSuratDate: jest
        .fn()
        .mockReturnValue(new Date("2026-07-28T09:00:00.000Z")),
    };
    const service = new RefundReturnTrackingSyncService(
      prisma as any,
      moduleRef as any,
      client as any,
    );
    return { service, prisma, client, refundService };
  };

  it("tracks a buyer return separately from the outbound shipment", async () => {
    const { service, prisma, client, refundService } = makeService(3);

    await expect(service.syncRefundReturnTracking("refund-1")).resolves.toBe(
      true,
    );

    expect(client.lookupTracking).toHaveBeenCalledWith("RETURN-REF-1");
    expect(prisma.refundRequest.update).toHaveBeenCalledWith({
      where: { id: "refund-1" },
      data: { returnProviderTrackingId: "RETURN-CARGO-CODE" },
    });
    expect(refundService.applyReturnTrackingUpdate).toHaveBeenCalledWith(
      "refund-1",
      {
        status: ShipmentStatus.in_transit,
        shippedAt: expect.any(Date),
        deliveredAt: undefined,
      },
    );
  });

  it("treats the first visible carrier record as physical branch acceptance", async () => {
    const { service, refundService } = makeService(1);

    await service.syncRefundReturnTracking("refund-1");

    expect(refundService.applyReturnTrackingUpdate).toHaveBeenCalledWith(
      "refund-1",
      {
        status: ShipmentStatus.picked_up,
        shippedAt: expect.any(Date),
        deliveredAt: undefined,
      },
    );
  });

  it("marks return delivery but defers refund finalization to inspection", async () => {
    const { service, refundService } = makeService(12);

    await expect(service.syncRefundReturnTracking("refund-1")).resolves.toBe(
      true,
    );

    expect(refundService.applyReturnTrackingUpdate).toHaveBeenCalledWith(
      "refund-1",
      {
        status: ShipmentStatus.returned,
        shippedAt: expect.any(Date),
        deliveredAt: new Date("2026-07-28T09:00:00.000Z"),
      },
    );
    expect(refundService.finalizeRefund).not.toHaveBeenCalled();
  });

  it("does not mutate a return for an unknown Sürat status", async () => {
    const { service, prisma, refundService } = makeService(99);

    await expect(service.syncRefundReturnTracking("refund-1")).resolves.toBe(
      false,
    );

    expect(prisma.refundRequest.update).not.toHaveBeenCalled();
    expect(refundService.applyReturnTrackingUpdate).not.toHaveBeenCalled();
  });

  it("finalises a return that completes with code 13, not 12", () => {
    // Sürat canlıda tamamlanmış iadeyi 13 ile döndü; tablo 13'ü
    // `return_in_progress`'e eşliyor. Buraya `return_in_progress` geçilirse iade
    // talebi `return_in_transit`'te donar, muayene penceresi hiç başlamaz ve
    // alıcı parasını hiç alamaz.
    const { service, refundService } = makeService(13, {
      KargonunDurumu: "Teslim Edildi (İade)",
      IadeDurum: "Evet",
      TeslimTarihi: "21/08/2026",
      Hareketler: [{ Islem: "İade Edildi" }],
    });

    return service.syncRefundReturnTracking("refund-1").then(() => {
      expect(refundService.applyReturnTrackingUpdate).toHaveBeenCalledWith(
        "refund-1",
        expect.objectContaining({ status: ShipmentStatus.returned }),
      );
    });
  });

  it("leaves a genuinely in-transit return alone", () => {
    const { service, refundService } = makeService(13, {
      KargonunDurumu: "İade Gönderi Yolda",
      IadeDurum: "Evet",
      Hareketler: [{ Islem: "Kargo İade Sürecinde" }],
    });

    return service.syncRefundReturnTracking("refund-1").then(() => {
      expect(refundService.applyReturnTrackingUpdate).toHaveBeenCalledWith(
        "refund-1",
        expect.objectContaining({ status: ShipmentStatus.return_in_progress }),
      );
    });
  });
});
