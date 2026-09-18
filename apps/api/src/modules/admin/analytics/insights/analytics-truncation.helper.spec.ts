import { ANALYTICS_STAMP_KEYS } from "@tarodan/types";
import {
  ANALYTICS_STAMP_SINCE,
  stampTruncations,
} from "./analytics-truncation.helper";

const windowFrom = (from: string) => ({
  gte: new Date(from),
  lte: new Date("2026-12-31T23:59:59.999Z"),
});

describe("stampTruncations", () => {
  /**
   * Damgadan önceye uzanan pencerede metrik EKSİK. Uyarı olmasaydı "geçen yıl
   * hiç iptal yokmuş" gibi okunurdu.
   */
  it("damganın başlangıcından önceye uzanan pencerede uyarır", () => {
    expect(
      stampTruncations(windowFrom("2026-01-01T00:00:00.000Z"), [
        "orderCancelledAt",
      ]),
    ).toEqual([
      {
        stamp: "orderCancelledAt",
        since: ANALYTICS_STAMP_SINCE.orderCancelledAt,
      },
    ]);
  });

  it("tamamen damga sonrasındaki pencerede uyarmaz", () => {
    expect(
      stampTruncations(windowFrom("2026-10-01T00:00:00.000Z"), [
        "orderCancelledAt",
      ]),
    ).toEqual([]);
  });

  it("tam olarak damga anında başlayan pencerede uyarmaz", () => {
    expect(
      stampTruncations(
        windowFrom(ANALYTICS_STAMP_SINCE.orderCancelledAt),
        ["orderCancelledAt"],
      ),
    ).toEqual([]);
  });

  /** Bir sekme birden çok damga ölçebilir (takas: ret + teklif cevabı). */
  it("yalnız etkilenen damgaları döner", () => {
    const stamps = stampTruncations(windowFrom("2026-01-01T00:00:00.000Z"), [
      "tradeRejectedAt",
      "offerRespondedAt",
    ]);

    expect(stamps.map((entry) => entry.stamp)).toEqual([
      "tradeRejectedAt",
      "offerRespondedAt",
    ]);
  });

  it("damga istenmediğinde boş döner", () => {
    expect(stampTruncations(windowFrom("2020-01-01T00:00:00.000Z"), [])).toEqual(
      [],
    );
  });

  /**
   * Katalog SÖZLEŞMEDİR: yeni bir damga eklenip buraya yazılmazsa ekran onun
   * eksik geçmişi hakkında hiçbir şey söyleyemez.
   */
  it("her damganın bir başlangıç anı vardır", () => {
    for (const stamp of ANALYTICS_STAMP_KEYS) {
      expect(Number.isNaN(Date.parse(ANALYTICS_STAMP_SINCE[stamp]))).toBe(false);
    }
    expect(Object.keys(ANALYTICS_STAMP_SINCE).sort()).toEqual(
      [...ANALYTICS_STAMP_KEYS].sort(),
    );
  });
});
