import { UserSellerTrustStatsService } from "./user-seller-trust-stats.service";

/**
 * The admin trust lab's account reads: on the caller's snapshot, selecting
 * no contact data (the e2e runs them against Postgres).
 */
describe("UserSellerTrustStatsService lab reads", () => {
  const make = () => {
    const tx = {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    return { tx, txc: tx as never, service: new UserSellerTrustStatsService() };
  };

  it("trustLabSubject maps the three scoring rules and selects no e-mail", async () => {
    const { tx, txc, service } = make();
    tx.user.findUnique.mockResolvedValue({
      id: "u1",
      username: "seller_one",
      deletedAt: new Date(),
      isBanned: true,
      isTestAccount: false,
    });
    await expect(service.trustLabSubject(txc, "u1")).resolves.toEqual({
      id: "u1",
      username: "seller_one",
      deleted: true,
      banned: true,
      testLane: false,
    });
    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: {
        id: true,
        username: true,
        deletedAt: true,
        isBanned: true,
        isTestAccount: true,
      },
    });
  });

  it("trustLabSubject is null for an unknown id", async () => {
    const { tx, txc, service } = make();
    tx.user.findUnique.mockResolvedValue(null);
    await expect(service.trustLabSubject(txc, "x")).resolves.toBeNull();
  });

  it("usernames reads all ids in one query and skips the query for none", async () => {
    const { tx, txc, service } = make();
    tx.user.findMany.mockResolvedValue([{ id: "a", username: "alpha" }]);
    await expect(service.usernames(txc, [])).resolves.toEqual(new Map());
    expect(tx.user.findMany).not.toHaveBeenCalled();
    await expect(service.usernames(txc, ["a", "b"])).resolves.toEqual(
      new Map([["a", "alpha"]]),
    );
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
      select: { id: true, username: true },
    });
  });
});
