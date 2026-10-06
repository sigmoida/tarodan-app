import {
  orderPaytrOidClauses,
  paymentByPaytrOidWhere,
  paytrOidSearchOf,
  tradePaytrOidClauses,
} from "./paytr-oid-search";

const GROUP_OID = "GRPDBN4NPYYTZT790149";

describe("paymentByPaytrOidWhere", () => {
  it("matches the current id exactly or an entry of merchantOidHistory", () => {
    expect(paymentByPaytrOidWhere(GROUP_OID)).toEqual({
      OR: [
        { providerConversationId: GROUP_OID },
        {
          metadata: {
            path: ["merchantOidHistory"],
            array_contains: GROUP_OID,
          },
        },
      ],
    });
  });
});

describe("paytrOidSearchOf", () => {
  it("recognises a PayTR id and groups its numbers by subject", () => {
    const search = paytrOidSearchOf(` ${GROUP_OID.toLowerCase()} `);
    expect(search?.oid).toBe(GROUP_OID);
    expect(search?.numbers).toEqual({
      order: [],
      group: ["GRP-DBN4NPYYTZ"],
      trade: [],
    });
    expect(search?.payment).toEqual(paymentByPaytrOidWhere(GROUP_OID));
  });

  it.each([
    "ORD-NGGCF4J4V4",
    "GRP-DBN4NPYYTZ",
    "ali",
    "",
    "  ",
    undefined,
    null,
  ])("ignores the ordinary term %p", (term) => {
    expect(paytrOidSearchOf(term)).toBeNull();
  });
});

describe("orderPaytrOidClauses", () => {
  it("adds nothing for an ordinary search term (existing search unchanged)", () => {
    expect(orderPaytrOidClauses("ORD-NGGCF4J4V4")).toEqual([]);
    expect(orderPaytrOidClauses("ahmet")).toEqual([]);
    expect(orderPaytrOidClauses(undefined)).toEqual([]);
  });

  it("finds a group by its current or historical id and by the parsed group number", () => {
    const payment = paymentByPaytrOidWhere(GROUP_OID);
    expect(orderPaytrOidClauses(GROUP_OID)).toEqual([
      { payment },
      { checkoutGroup: { payment } },
      { checkoutGroup: { groupNumber: { in: ["GRP-DBN4NPYYTZ"] } } },
    ]);
  });

  it("finds a single order by the parsed order number", () => {
    const clauses = orderPaytrOidClauses("ORDNGGCF4J4V4T790149");
    expect(clauses).toContainEqual({
      orderNumber: { in: ["ORD-NGGCF4J4V4"] },
    });
  });
});

describe("tradePaytrOidClauses", () => {
  it("adds nothing for an ordinary term", () => {
    expect(tradePaytrOidClauses("TKS-K7X9M2QF3N")).toEqual([]);
  });

  it("finds a trade through its cash payment and the parsed trade number", () => {
    const oid = "TRADETKSK7X9M2QF3NT123456";
    expect(tradePaytrOidClauses(oid)).toEqual([
      { cashPayments: { some: { payment: paymentByPaytrOidWhere(oid) } } },
      { tradeNumber: { in: ["TKS-K7X9M2QF3N"] } },
    ]);
  });
});
