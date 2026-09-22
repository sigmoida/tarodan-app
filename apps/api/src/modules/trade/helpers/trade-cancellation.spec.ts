import { CancellationActor, TradeStatus } from "@prisma/client";
import { unstampedTransitions } from "../../../common/helpers/stamped-transition.guard";
import {
  TRADE_CANCEL_REASON,
  TRADE_EXPIRY_CANCEL_REASONS,
  isTradeExpiryCancelReason,
} from "./trade-cancel-reasons";
import { tradeCancelledData, tradePartyActor } from "./trade-cancellation";

describe("tradeCancelledData", () => {
  it("stamps the cancellation moment and the actor alongside the status", () => {
    const at = new Date("2026-09-20T08:00:00.000Z");
    expect(tradeCancelledData(CancellationActor.platform, at)).toEqual({
      status: TradeStatus.cancelled,
      cancelledAt: at,
      cancelledBy: CancellationActor.platform,
    });
  });

  it("defaults to now so callers cannot forget the stamp", () => {
    const before = Date.now();
    const { cancelledAt } = tradeCancelledData(CancellationActor.system);
    expect(cancelledAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  /**
   * Gerekçe çağıranındır: iade bacakları kapanınca takas iptale geçer ama
   * yöneticinin daha önce yazdığı gerekçe korunmalıdır. Yardımcı onu ezmez.
   */
  it("never writes a reason of its own", () => {
    expect(tradeCancelledData(CancellationActor.platform)).not.toHaveProperty(
      "cancelReason",
    );
  });

  /**
   * Takasın iptal yolları çok (kullanıcı, süre dolumu, stok, kayıp koli, ban,
   * üyelik düşüşü, zorla iptal, iade kapanışı). `status: cancelled`i doğrudan
   * yazan yeni bir yol aktörü ve damgayı atlar — kural kaynak üzerinde
   * denetlenir.
   */
  it("is the ONLY way a trade is written to cancelled", () => {
    expect(
      unstampedTransitions({
        delegate: "trade",
        statuses: ["cancelled"],
        enumName: "TradeStatus",
        helpers: ["tradeCancelledData"],
      }),
    ).toEqual([]);
  });
});

describe("tradePartyActor", () => {
  const trade = { initiatorId: "u-init", receiverId: "u-recv" };

  it("maps the initiator to buyer and the listing owner to seller", () => {
    expect(tradePartyActor(trade, "u-init")).toBe(CancellationActor.buyer);
    expect(tradePartyActor(trade, "u-recv")).toBe(CancellationActor.seller);
  });

  it("refuses to guess for someone who is not a party", () => {
    expect(() => tradePartyActor(trade, "u-other")).toThrow();
  });
});

describe("trade expiry reasons", () => {
  it('treats only the deadline sweep as "Süresi Dolan"', () => {
    expect([...TRADE_EXPIRY_CANCEL_REASONS]).toEqual([
      TRADE_CANCEL_REASON.autoExpired,
    ]);
    expect(isTradeExpiryCancelReason(TRADE_CANCEL_REASON.autoExpired)).toBe(
      true,
    );
  });

  it("keeps lost parcels, stock and account events out of the expiry bucket", () => {
    for (const reason of [
      TRADE_CANCEL_REASON.lostParcel,
      TRADE_CANCEL_REASON.stockDepleted,
      TRADE_CANCEL_REASON.accountBanned,
      TRADE_CANCEL_REASON.membershipDowngraded,
      TRADE_CANCEL_REASON.adminForceCancelStuck("koli takıldı"),
    ]) {
      expect(isTradeExpiryCancelReason(reason)).toBe(false);
    }
    expect(isTradeExpiryCancelReason(null)).toBe(false);
  });

  /** Geçmiş satırlar bu metinlerle yazıldı; aktör doldurması birebir eşler. */
  it("keeps the literals historical rows were written with", () => {
    expect(TRADE_CANCEL_REASON.accountBanned).toBe(
      "Kullanıcı banlandığı için takas iptal edildi",
    );
    expect(TRADE_CANCEL_REASON.membershipDowngraded).toBe(
      "Üyelik süresi sona erdiği için bekleyen takas teklifiniz otomatik iptal edildi.",
    );
  });
});
