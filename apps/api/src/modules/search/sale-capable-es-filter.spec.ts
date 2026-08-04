import { saleCapableEsFilters } from "./sale-capable-es-filter";

describe("saleCapableEsFilters", () => {
  it("requires eligibility and enforces the corporate entitlement boundary", () => {
    const now = new Date("2026-08-04T12:00:00.000Z");

    expect(saleCapableEsFilters(now)).toEqual([
      { term: { sellerCanSell: true } },
      {
        bool: {
          should: [
            {
              bool: {
                must_not: {
                  exists: { field: "sellerSalesEntitledUntil" },
                },
              },
            },
            {
              range: {
                sellerSalesEntitledUntil: { gt: now.toISOString() },
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
    ]);
  });
});
