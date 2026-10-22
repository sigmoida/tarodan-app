import {
  distanceSalesTradeDetails,
  distanceSalesTradeWhere,
  tradeOfConsentDetails,
} from "./distance-sales-trade";

const target = {
  tradeId: "trade-1",
  tradeNumber: "TKS-10001",
  tradeCashPaymentId: "tcp-1",
};

describe("distance sales trade reference in consent details", () => {
  it("writes only the reference", () => {
    expect(distanceSalesTradeDetails(target)).toEqual(target);
  });

  // The gate looks up what the payment form wrote: the JSON path it queries
  // must be a key of the written details, holding the same cash payment id.
  it("queries the same details key that it writes", () => {
    const details = distanceSalesTradeDetails(target) as Record<
      string,
      unknown
    >;
    const where = distanceSalesTradeWhere("tcp-1");
    const filter = where.details as { path: string[]; equals: unknown };

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
