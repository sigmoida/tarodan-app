import { BadRequestException } from "@nestjs/common";
import { OrderStatus, PaymentStatus, ShipmentStatus } from "@prisma/client";
import { RefundCreationService } from "./refund-creation.service";
import { TIMING_RULES } from "@tarodan/types";

/**
 * Pencere dolduktan sonra gelen iade talebi "N günlük iade süresi doldu" der;
 * N, o anki iade penceresi (Süreler ve Kurallar → returnWindowDays) olmalı —
 * kataloğa gömülü sabit 14 değil. Hata gövdesi yerelleştirme parametresini
 * taşır, metni istemcinin diline filtre çevirir.
 */
describe("RefundCreationService — pencere dolmuş iade mesajı", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);

  const makeService = (windowDays: string | null) => {
    const order = {
      id: "o1",
      orderNumber: "ORD-1",
      buyerId: "buyer1",
      status: OrderStatus.delivered,
      deliveredAt: daysAgo(40),
      returnWindowEndsAt: daysAgo(5),
      payment: { status: PaymentStatus.completed },
      shipment: { status: ShipmentStatus.delivered, deliveredAt: null },
      refundRequests: [],
      quantity: 1,
    };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      platformSetting: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            windowDays === null
              ? null
              : { settingValue: windowDays, updatedBy: "admin-1" },
          ),
      },
    };
    return new RefundCreationService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  };

  const expiredPayload = async (windowDays: string | null) => {
    const service = makeService(windowDays);
    const error = await service
      .createRefundRequest("o1", "buyer1", {
        reason: "damaged",
        evidencePhotoUrls: ["https://cdn/x.jpg"],
      } as any)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
      i18nKey: string;
      i18nParams?: Record<string, unknown>;
    };
  };

  it("yapılandırılmış iade penceresini parametre olarak taşır", async () => {
    const payload = await expiredPayload("30");

    expect(payload.i18nKey).toBe("server.refund.coolingOffExpired");
    expect(payload.i18nParams).toEqual({ returnWindowDays: 30 });
  });

  it("ayar yoksa kayıt varsayılanını taşır", async () => {
    const payload = await expiredPayload(null);

    expect(payload.i18nParams).toEqual({
      returnWindowDays: TIMING_RULES.returnWindowDays.default,
    });
  });
});
