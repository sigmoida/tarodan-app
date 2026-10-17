import { describe, expect, it } from "vitest";
import type { PublicTimingPolicy } from "@tarodan/types";
import { FALLBACK_TIMING_POLICY } from "@/lib/timing-policy";
import {
  computePayoutDate,
  inferRefundPhase,
  isOrderReturnable,
  isPastRefundWindow,
  returnWindowEnd,
  type OrderDetail,
} from "./types";

/**
 * İade penceresi ve satıcı ödeme tarihi SUNUCU değerinden okunur.
 *
 * Eskiden ekran `@tarodan/shared` sabitiyle (14 gün) kendi hesabını yapıyordu:
 * admin pencereyi 30 güne çıkarınca API iadeyi kabul ederken web iade butonunu
 * çoktan gizliyordu. Artık sipariş `returnWindowEndsAt`'ini taşır; yalnız bu
 * alan olmayan (damgadan önce teslim edilmiş) siparişte politikayla hesaplanır.
 */

const DAY_MS = 86_400_000;
const DELIVERED = "2026-01-01T10:00:00.000Z";

const policy = (
  returnWindowDays: number,
  payoutGraceDays = 1,
): PublicTimingPolicy => ({
  ...FALLBACK_TIMING_POLICY,
  returnWindowDays: { value: returnWindowDays, unit: "days" },
  payoutGraceDays: { value: payoutGraceDays, unit: "days" },
});

const order = (overrides: Partial<OrderDetail> = {}): OrderDetail =>
  ({
    id: "o1",
    orderNumber: "ORD-1",
    status: "delivered",
    isBuyer: true,
    deliveredAt: DELIVERED,
    returnWindowEndsAt: null,
    escrowReleaseAt: null,
    payment: { id: "p1", status: "completed", amount: 100, provider: "paytr" },
    shipment: {
      id: "s1",
      provider: "surat",
      trackingNumber: "1",
      status: "delivered",
    },
    ...overrides,
  }) as unknown as OrderDetail;

describe("returnWindowEnd", () => {
  it("damgalı sunucu değerini kullanır, politikayı yok sayar", () => {
    const stamped = "2026-01-31T10:00:00.000Z"; // teslim + 30 gün
    const end = returnWindowEnd(
      order({ returnWindowEndsAt: stamped }),
      policy(14),
    );
    expect(end?.toISOString()).toBe(stamped);
  });

  it("damga null ise (eski sipariş) teslim + politika penceresiyle hesaplar", () => {
    const end = returnWindowEnd(order(), policy(30));
    expect(end?.toISOString()).toBe("2026-01-31T10:00:00.000Z");
  });

  it("geri düşüş politikasında sabit 14 gün kullanır", () => {
    const end = returnWindowEnd(order(), FALLBACK_TIMING_POLICY);
    expect(end?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("teslim edilmemiş ve damgasız sipariş için null", () => {
    expect(
      returnWindowEnd(order({ deliveredAt: null }), policy(14)),
    ).toBeNull();
  });

  it("bozuk damga tarihinde hesaplanan değere düşer", () => {
    const end = returnWindowEnd(
      order({ returnWindowEndsAt: "garbage" }),
      policy(14),
    );
    expect(end?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });
});

describe("isPastRefundWindow", () => {
  const deliveredMs = new Date(DELIVERED).getTime();

  it("pencereyi API ile aynı damgadan okur: 30 günlük damgada 20. gün açık", () => {
    const stamped = "2026-01-31T10:00:00.000Z";
    const sut = order({ returnWindowEndsAt: stamped });
    // Sabit 14 gün olsaydı 20. günde kapalı sayılırdı (API ise kabul ederdi).
    expect(isPastRefundWindow(sut, policy(14), deliveredMs + 20 * DAY_MS)).toBe(
      false,
    );
    expect(isPastRefundWindow(sut, policy(14), deliveredMs + 31 * DAY_MS)).toBe(
      true,
    );
  });

  it("damgasız siparişte politika penceresini uygular", () => {
    expect(
      isPastRefundWindow(order(), policy(30), deliveredMs + 20 * DAY_MS),
    ).toBe(false);
    expect(
      isPastRefundWindow(order(), policy(14), deliveredMs + 20 * DAY_MS),
    ).toBe(true);
  });

  it("pencere sonu anında hâlâ açık (yalnız sonrası kapalı)", () => {
    const end = new Date("2026-01-15T10:00:00.000Z").getTime();
    expect(isPastRefundWindow(order(), policy(14), end)).toBe(false);
    expect(isPastRefundWindow(order(), policy(14), end + 1)).toBe(true);
  });

  it("teslim edilmemiş siparişte pencere başlamadı", () => {
    expect(
      isPastRefundWindow(order({ deliveredAt: null }), policy(14), Date.now()),
    ).toBe(false);
  });
});

describe("computePayoutDate", () => {
  it("sunucunun hold'a yazdığı escrowReleaseAt'i olduğu gibi gösterir", () => {
    const release = "2026-01-20T00:00:00.000Z";
    const date = computePayoutDate(
      order({ escrowReleaseAt: release }),
      policy(14),
    );
    expect(date?.toISOString()).toBe(release);
  });

  it("hold tarihi yoksa damgalı pencere sonu + payout grace", () => {
    const date = computePayoutDate(
      order({ returnWindowEndsAt: "2026-01-31T10:00:00.000Z" }),
      policy(14, 2),
    );
    expect(date?.toISOString()).toBe("2026-02-02T10:00:00.000Z");
  });

  it("hiçbir sunucu değeri yoksa teslim + politika penceresi + grace", () => {
    const date = computePayoutDate(order(), policy(30, 1));
    expect(date?.toISOString()).toBe("2026-02-01T10:00:00.000Z");
  });

  it("teslim edilmemiş siparişte null", () => {
    expect(
      computePayoutDate(order({ deliveredAt: null }), policy(14)),
    ).toBeNull();
  });
});

describe("iade uygunluğu pencereyi sunucu damgasından alır", () => {
  const stampedOpen = order({
    // Pencere yarın bitiyor (damgalı); sabit 14 gün hesabı bunu kapalı sayardı.
    deliveredAt: new Date(Date.now() - 20 * DAY_MS).toISOString(),
    returnWindowEndsAt: new Date(Date.now() + DAY_MS).toISOString(),
  });

  it("isOrderReturnable damga açıkken true", () => {
    expect(isOrderReturnable(stampedOpen, policy(14))).toBe(true);
  });

  it("isOrderReturnable damga geçtiyse false", () => {
    const closed = order({
      deliveredAt: new Date(Date.now() - 40 * DAY_MS).toISOString(),
      returnWindowEndsAt: new Date(Date.now() - DAY_MS).toISOString(),
    });
    expect(isOrderReturnable(closed, policy(30))).toBe(false);
  });

  it("inferRefundPhase damgaya göre in_cooling_off / past_cooling_off", () => {
    expect(inferRefundPhase(stampedOpen, policy(14))).toBe("in_cooling_off");
    const closed = order({
      deliveredAt: new Date(Date.now() - 40 * DAY_MS).toISOString(),
      returnWindowEndsAt: new Date(Date.now() - DAY_MS).toISOString(),
    });
    expect(inferRefundPhase(closed, policy(30))).toBe("past_cooling_off");
  });
});
