import {
  orderPaytrOidClauses,
  paymentByPaytrOidWhere,
  paymentOidHistoryWhere,
  resolvePaytrOidMatch,
  tradePaytrOidClauses,
} from "./paytr-oid-search";

const GROUP_OID = "GRPDBN4NPYYTZT790149";
const BOOST_OID = "BSTK7X9M2QF3NT123456";

const makePrisma = (rows: Array<Record<string, string | null>> = []) => ({
  payment: { findMany: jest.fn().mockResolvedValue(rows) },
});

describe("paymentOidHistoryWhere / paymentByPaytrOidWhere", () => {
  it("history is a merchantOidHistory array_contains (the exact shape callback and reconciliation use)", () => {
    expect(paymentOidHistoryWhere(GROUP_OID)).toEqual({
      metadata: { path: ["merchantOidHistory"], array_contains: GROUP_OID },
    });
  });

  it("matches the current id exactly or the history", () => {
    expect(paymentByPaytrOidWhere(GROUP_OID)).toEqual({
      OR: [
        { providerConversationId: GROUP_OID },
        paymentOidHistoryWhere(GROUP_OID),
      ],
    });
  });
});

describe("resolvePaytrOidMatch", () => {
  it.each([
    "ORD-NGGCF4J4V4",
    "GRP-DBN4NPYYTZ",
    "ali",
    "",
    "  ",
    undefined,
    null,
  ])("ordinary term %p: no match and no query", async (term) => {
    const prisma = makePrisma();
    expect(await resolvePaytrOidMatch(prisma as never, term)).toBeNull();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it("resolves a known-prefix id with ONE payment query and groups the ids", async () => {
    const prisma = makePrisma([
      {
        id: "p1",
        orderId: null,
        checkoutGroupId: "g1",
        tradeCashPaymentId: null,
      },
    ]);
    const match = await resolvePaytrOidMatch(prisma as never, ` ${GROUP_OID} `);
    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.payment.findMany).toHaveBeenCalledWith({
      where: paymentByPaytrOidWhere(GROUP_OID),
      select: {
        id: true,
        orderId: true,
        checkoutGroupId: true,
        tradeCashPaymentId: true,
      },
    });
    expect(match).toMatchObject({
      paymentIds: ["p1"],
      orderIds: [],
      groupIds: ["g1"],
      tradeCashPaymentIds: [],
      numbers: { order: [], group: ["GRP-DBN4NPYYTZ"], trade: [] },
    });
  });

  it("finds payments of subjects the parser does not know (boost, membership, id fallback)", async () => {
    const prisma = makePrisma([
      {
        id: "p9",
        orderId: "o9",
        checkoutGroupId: null,
        tradeCashPaymentId: null,
      },
    ]);
    const match = await resolvePaytrOidMatch(prisma as never, BOOST_OID);
    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
    expect(match?.paymentIds).toEqual(["p9"]);
    expect(match?.orderIds).toEqual(["o9"]);
    expect(match?.numbers).toEqual({ order: [], group: [], trade: [] });
  });

  it("a dash-less number without the attempt suffix only yields numbers (no payment query)", async () => {
    const prisma = makePrisma();
    const match = await resolvePaytrOidMatch(prisma as never, "GRPDBN4NPYYTZ");
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(match?.numbers.group).toEqual(["GRP-DBN4NPYYTZ"]);
  });
});

describe("orderPaytrOidClauses", () => {
  it("adds nothing without a match (existing search unchanged)", () => {
    expect(orderPaytrOidClauses(null)).toEqual([]);
    expect(orderPaytrOidClauses(undefined)).toEqual([]);
  });

  it("uses plain id lists — no JSON condition is embedded in the where", () => {
    const clauses = orderPaytrOidClauses({
      paymentIds: ["p1"],
      orderIds: ["o1"],
      groupIds: ["g1"],
      tradeCashPaymentIds: [],
      numbers: {
        order: ["ORD-AAAAAAAAAA"],
        group: ["GRP-BBBBBBBBBB"],
        trade: [],
      },
    });
    expect(clauses).toEqual([
      { id: { in: ["o1"] } },
      { checkoutGroupId: { in: ["g1"] } },
      { orderNumber: { in: ["ORD-AAAAAAAAAA"] } },
      { checkoutGroup: { groupNumber: { in: ["GRP-BBBBBBBBBB"] } } },
    ]);
    expect(JSON.stringify(clauses)).not.toContain("merchantOidHistory");
  });
});

describe("tradePaytrOidClauses", () => {
  it("adds nothing without a match", () => {
    expect(tradePaytrOidClauses(null)).toEqual([]);
  });

  it("finds a trade through its cash payment ids and the parsed trade number", () => {
    expect(
      tradePaytrOidClauses({
        paymentIds: ["p1"],
        orderIds: [],
        groupIds: [],
        tradeCashPaymentIds: ["c1"],
        numbers: { order: [], group: [], trade: ["TKS-K7X9M2QF3N"] },
      }),
    ).toEqual([
      { cashPayments: { some: { id: { in: ["c1"] } } } },
      { tradeNumber: { in: ["TKS-K7X9M2QF3N"] } },
    ]);
  });
});
