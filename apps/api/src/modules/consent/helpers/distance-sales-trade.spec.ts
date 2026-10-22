import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { apiAppRoot } from "../../../common/helpers/app-root";
import {
  TRADE_CONSENT_UNIQUE_INDEX,
  distanceSalesTradeDetails,
  distanceSalesTradeWhere,
  isTradeConsentUniqueViolation,
  legacyTradeConsentDetailsWhere,
  tradeOfConsentDetails,
  tradeOfConsentRow,
} from "./distance-sales-trade";

const target = {
  tradeId: "trade-1",
  tradeNumber: "TKS-10001",
  tradeCashPaymentId: "tcp-1",
};

const p2002 = (uniqueTarget: unknown) =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: uniqueTarget },
  });

describe("distance sales trade reference", () => {
  it("writes only the reference into details", () => {
    expect(distanceSalesTradeDetails(target)).toEqual(target);
  });

  it("looks a consent up by the column or, for a legacy row, by details", () => {
    expect(distanceSalesTradeWhere("tcp-1")).toEqual({
      OR: [
        { tradeCashPaymentId: "tcp-1" },
        legacyTradeConsentDetailsWhere("tcp-1"),
      ],
    });
  });

  // The legacy fallback looks up what the payment form wrote before the
  // column: the JSON path it queries must be a key of the written details,
  // holding the same cash payment id, and only rows without the column match.
  it("the legacy fallback queries the details key that is written", () => {
    const details = distanceSalesTradeDetails(target) as Record<
      string,
      unknown
    >;
    const where = legacyTradeConsentDetailsWhere("tcp-1");
    const filter = where.details as { path: string[]; equals: unknown };

    expect(where.tradeCashPaymentId).toBeNull();
    expect(filter.path).toHaveLength(1);
    expect(details[filter.path[0]]).toBe(filter.equals);
  });

  it("reads the trade back from what it wrote", () => {
    const details = distanceSalesTradeDetails(target) as Record<
      string,
      unknown
    >;

    expect(tradeOfConsentDetails(details)).toEqual({
      id: "trade-1",
      tradeNumber: "TKS-10001",
    });
  });

  it.each([
    ["no details", null],
    ["cookie categories", { analytics: true, marketing: false }],
    ["a missing trade number", { tradeId: "trade-1" }],
    ["a non-string trade id", { tradeId: 1, tradeNumber: "TKS-10001" }],
  ])("reads no trade from %s", (_label, details) => {
    expect(
      tradeOfConsentDetails(details as Record<string, unknown> | null),
    ).toBeNull();
  });
});

describe("tradeOfConsentRow", () => {
  const linked = { trade: { id: "trade-2", tradeNumber: "TKS-20002" } };
  const details = distanceSalesTradeDetails(target) as Record<string, unknown>;

  it("prefers the linked cash payment's trade", () => {
    expect(
      tradeOfConsentRow({
        document: "distance_sales",
        details,
        tradeCashPayment: linked,
      }),
    ).toEqual({ id: "trade-2", tradeNumber: "TKS-20002" });
  });

  it("falls back to details for a row without the link (legacy or purged)", () => {
    expect(
      tradeOfConsentRow({
        document: "distance_sales",
        details,
        tradeCashPayment: null,
      }),
    ).toEqual({ id: "trade-1", tradeNumber: "TKS-10001" });
  });

  it("reads details as a trade only on a distance sales row", () => {
    expect(
      tradeOfConsentRow({
        document: "cookies",
        details,
        tradeCashPayment: null,
      }),
    ).toBeNull();
  });
});

describe("isTradeConsentUniqueViolation", () => {
  it.each([
    ["the index name", TRADE_CONSENT_UNIQUE_INDEX],
    ["the column list", ["trade_cash_payment_id"]],
    ["the field list", ["tradeCashPaymentId"]],
  ])("matches a P2002 that names %s", (_label, uniqueTarget) => {
    expect(isTradeConsentUniqueViolation(p2002(uniqueTarget))).toBe(true);
  });

  it.each([
    ["another unique target", p2002(["id"])],
    [
      "a composite target that includes the column",
      p2002(["trade_cash_payment_id", "version"]),
    ],
    ["another index name", p2002("consent_records_trade_cash_payment_id_idx")],
    [
      "another Prisma error",
      new Prisma.PrismaClientKnownRequestError("FK", {
        code: "P2003",
        clientVersion: "test",
        meta: { field_name: "trade_cash_payment_id" },
      }),
    ],
    ["a plain error", new Error("trade_cash_payment_id")],
    ["a P2002-shaped object", { code: "P2002", meta: { target: "x" } }],
  ])("does not match %s", (_label, error) => {
    expect(isTradeConsentUniqueViolation(error)).toBe(false);
  });

  it("names the index the migration creates", () => {
    const sql = readFileSync(
      join(
        apiAppRoot(),
        "prisma/migrations/20261022180000_consent_records_trade_cash_payment/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain(
      `CREATE UNIQUE INDEX "${TRADE_CONSENT_UNIQUE_INDEX}"`,
    );
  });
});
