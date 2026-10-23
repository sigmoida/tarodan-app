import { assembleTrustInputs, hasTrustActivity } from "./trust-inputs";

const asOf = new Date("2026-10-21T23:30:00.000Z");
const daysBefore = (days: number) =>
  new Date(asOf.getTime() - days * 86_400_000);

describe("assembleTrustInputs", () => {
  it("caps each counterparty at 3 across sales and trades together", () => {
    const [seller] = assembleTrustInputs(
      {
        eligible: [{ id: "s1", createdAt: daysBefore(100) }],
        fulfilment: [],
        ratings: [],
        sales: [
          // Ten completed orders from one buyer add 3.
          { userId: "s1", counterpartyKey: "b1", count: 10 },
          // Two sales and two trades with the same person: one counterparty, 3.
          { userId: "s1", counterpartyKey: "b2", count: 2 },
          { userId: "s1", counterpartyKey: "b3", count: 1 },
        ],
        trades: [{ userId: "s1", counterpartyKey: "b2", count: 2 }],
      },
      asOf,
    );
    expect(seller.inputs.transactions).toBe(3 + 3 + 1);
    expect(seller.inputs.counterparties).toBe(3);
  });

  it("counts each guest order as its own counterparty", () => {
    const [seller] = assembleTrustInputs(
      {
        eligible: [{ id: "s1", createdAt: asOf }],
        fulfilment: [],
        ratings: [],
        sales: [
          { userId: "s1", counterpartyKey: "order:o1", count: 1 },
          { userId: "s1", counterpartyKey: "order:o2", count: 1 },
          { userId: "s1", counterpartyKey: "order:o3", count: 1 },
          { userId: "s1", counterpartyKey: "order:o4", count: 1 },
        ],
        trades: [],
      },
      asOf,
    );
    expect(seller.inputs.transactions).toBe(4);
    expect(seller.inputs.counterparties).toBe(4);
  });

  it("maps the domain rows by user and keeps the eligible order", () => {
    const result = assembleTrustInputs(
      {
        eligible: [
          { id: "a", createdAt: daysBefore(730.9) },
          { id: "b", createdAt: daysBefore(1) },
        ],
        fulfilment: [
          { userId: "b", eligible: 4, failures: 1, shipped: 3, late: 1 },
        ],
        ratings: [{ userId: "b", raters: 2, sumOfGiverMeans: 9.5 }],
        sales: [{ userId: "a", counterpartyKey: "x", count: 1 }],
        trades: [
          // Not eligible (banned, deleted, test lane): ignored.
          { userId: "zz", counterpartyKey: "a", count: 3 },
        ],
      },
      asOf,
    );
    expect(result.map((r) => r.userId)).toEqual(["a", "b"]);
    expect(result[0].inputs).toEqual({
      raters: 0,
      sumOfGiverMeans: 0,
      eligibleOrders: 0,
      failures: 0,
      shipped: 0,
      late: 0,
      transactions: 1,
      counterparties: 1,
      tenureDays: 730,
    });
    expect(result[1].inputs).toMatchObject({
      raters: 2,
      sumOfGiverMeans: 9.5,
      eligibleOrders: 4,
      failures: 1,
      shipped: 3,
      late: 1,
      transactions: 0,
      tenureDays: 1,
    });
  });

  it("never gives negative tenure for a clock skew", () => {
    const [u] = assembleTrustInputs(
      {
        eligible: [{ id: "u", createdAt: new Date(asOf.getTime() + 60_000) }],
        fulfilment: [],
        ratings: [],
        sales: [],
        trades: [],
      },
      asOf,
    );
    expect(u.inputs.tenureDays).toBe(0);
  });
});

describe("hasTrustActivity", () => {
  const none = {
    raters: 0,
    sumOfGiverMeans: 0,
    eligibleOrders: 0,
    failures: 0,
    shipped: 0,
    late: 0,
    transactions: 0,
    counterparties: 0,
    tenureDays: 900,
  };

  it("is false for tenure alone", () => {
    expect(hasTrustActivity(none)).toBe(false);
  });

  it.each([
    [{ raters: 1 }],
    [{ eligibleOrders: 1 }],
    [{ transactions: 1, counterparties: 1 }],
  ])("is true with %p", (over) => {
    expect(hasTrustActivity({ ...none, ...over })).toBe(true);
  });
});
