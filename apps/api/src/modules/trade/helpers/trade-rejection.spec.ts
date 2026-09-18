import { TradeStatus } from "@prisma/client";
import { unstampedTransitions } from "../../../common/helpers/stamped-transition.guard";
import { tradeRejectedData } from "./trade-rejection";

describe("tradeRejectedData", () => {
  it("stamps the rejection moment alongside the status", () => {
    const at = new Date("2026-05-02T09:00:00.000Z");
    expect(tradeRejectedData("Ürün beklediğim gibi değil", at)).toEqual({
      status: TradeStatus.rejected,
      cancelReason: "Ürün beklediğim gibi değil",
      rejectedAt: at,
      cancelledAt: at,
    });
  });

  /**
   * Ret bir iptaldir — para/stok akışı iptal yoluyla çözülür — ama huninin
   * "iptal" çıkışı reddi İKİNCİ kez saymamalı. İki damganın birlikte yazılması
   * analitiğin `rejectedAt IS NULL` ayrımını mümkün kılan şey.
   */
  it("also stamps the cancellation, so the money path stays unchanged", () => {
    const { cancelledAt, rejectedAt } = tradeRejectedData(null);
    expect(cancelledAt).toEqual(rejectedAt);
  });

  it("normalises a missing reason to null instead of undefined", () => {
    expect(tradeRejectedData(undefined).cancelReason).toBeNull();
  });

  it("defaults to now so callers cannot forget the stamp", () => {
    const before = Date.now();
    expect(tradeRejectedData(null).rejectedAt.getTime()).toBeGreaterThanOrEqual(
      before,
    );
  });

  it("is the ONLY way a trade is written to rejected", () => {
    expect(
      unstampedTransitions({
        delegate: "trade",
        statuses: ["rejected"],
        enumName: "TradeStatus",
        helpers: ["tradeRejectedData"],
      }),
    ).toEqual([]);
  });
});
