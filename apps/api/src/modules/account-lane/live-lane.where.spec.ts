import { Prisma } from "@prisma/client";
import {
  LIVE_COMMISSION_LEDGER,
  LIVE_LEDGER_ENTRY,
  LIVE_MEMBERSHIP_PAYMENT,
  LIVE_OFFER,
  LIVE_ORDER,
  LIVE_PAYMENT,
  LIVE_PAYOUT_TRANSFER,
  LIVE_PRODUCT,
  LIVE_PRODUCT_BOOST,
  LIVE_REFUND_ATTEMPT,
  LIVE_REFUND_REQUEST,
  LIVE_TRADE,
  LIVE_TRADE_CASH_PAYMENT,
  LIVE_USER,
  LIVE_USER_MEMBERSHIP,
  col,
  liveMembershipPaymentSql,
  liveOrderRefSql,
  livePayoutTransferSql,
  liveRowSql,
  liveTradeRefSql,
  liveUserRefSql,
} from "./live-lane.where";

/**
 * Raporların şerit yüklemleri TEK dosyada. Bu spec her türetmenin doğru damgaya
 * bağlandığını sabitler: bir tablo yanlış damgaya bağlanırsa (ör. üyelik
 * yenilemesi siparişe) rapor test şeridini sessizce saymaya başlar.
 */
describe("live lane predicates", () => {
  it("stamped tables read their own is_test", () => {
    for (const where of [
      LIVE_ORDER,
      LIVE_PAYMENT,
      LIVE_TRADE,
      LIVE_LEDGER_ENTRY,
    ]) {
      expect(where).toEqual({ isTest: false });
    }
    expect(LIVE_USER).toEqual({ isTestAccount: false });
  });

  it("derived tables read the stamp of the row they hang off", () => {
    expect(LIVE_COMMISSION_LEDGER).toEqual({ order: { isTest: false } });
    expect(LIVE_REFUND_REQUEST).toEqual({ order: { isTest: false } });
    // Deneme hem sipariş hem takas iadesinde ödemeye bağlıdır.
    expect(LIVE_REFUND_ATTEMPT).toEqual({ payment: { isTest: false } });
    expect(LIVE_TRADE_CASH_PAYMENT).toEqual({ trade: { isTest: false } });
  });

  it("owner-scoped tables read the account flag (recurring membership has no order)", () => {
    expect(LIVE_MEMBERSHIP_PAYMENT).toEqual({
      membership: { user: { isTestAccount: false } },
    });
    expect(LIVE_USER_MEMBERSHIP).toEqual({ user: { isTestAccount: false } });
    expect(LIVE_PRODUCT_BOOST).toEqual({ user: { isTestAccount: false } });
    expect(LIVE_PRODUCT).toEqual({ seller: { isTestAccount: false } });
    expect(LIVE_OFFER).toEqual({ buyer: { isTestAccount: false } });
  });

  it("payouts drop only the explicitly-test transfers (a hold-less live transfer stays)", () => {
    expect(LIVE_PAYOUT_TRANSFER).toEqual({
      NOT: {
        OR: [
          { paymentHold: { payment: { isTest: true } } },
          { tradeCashPayment: { payment: { isTest: true } } },
        ],
      },
    });
  });
});

describe("live lane SQL fragments", () => {
  it("row fragment qualifies the literal alias", () => {
    expect(liveRowSql("o").sql).toBe('"o"."is_test" = false');
    expect(liveRowSql("o").values).toEqual([]);
  });

  it("reference fragments join to the stamped / flagged row", () => {
    expect(liveOrderRefSql(col("r", "order_id")).sql).toContain(
      'lane_o."id" = "r"."order_id" AND lane_o."is_test" = false',
    );
    expect(liveTradeRefSql(col("p", "trade_id")).sql).toContain(
      'lane_t."id" = "p"."trade_id" AND lane_t."is_test" = false',
    );
    expect(liveUserRefSql(col("b", "user_id")).sql).toContain(
      'lane_u."id" = "b"."user_id" AND lane_u."is_test_account" = false',
    );
    expect(liveMembershipPaymentSql("mp").sql).toContain(
      'lane_m."id" = "mp"."membership_id"',
    );
    expect(liveMembershipPaymentSql("mp").sql).toContain(
      'lane_u."is_test_account" = false',
    );
  });

  it("payout fragment mirrors the Prisma NOT (hold path and trade path)", () => {
    const sql = livePayoutTransferSql("pt").sql;
    expect(sql).toContain('lane_h."id" = "pt"."payment_hold_id"');
    expect(sql).toContain(
      'lane_p."trade_cash_payment_id" = "pt"."trade_cash_payment_id"',
    );
    expect(sql.match(/NOT EXISTS/g)).toHaveLength(2);
  });

  it("fragments carry no bound values — nothing request-derived is interpolated", () => {
    for (const fragment of [
      liveRowSql("o"),
      liveOrderRefSql(col("r", "order_id")),
      livePayoutTransferSql("pt"),
      liveMembershipPaymentSql("mp"),
    ]) {
      expect(fragment).toBeInstanceOf(Prisma.Sql);
      expect(fragment.values).toEqual([]);
    }
  });
});
