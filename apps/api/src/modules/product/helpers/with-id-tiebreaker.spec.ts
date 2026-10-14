import { withIdTiebreaker } from "./with-id-tiebreaker";

describe("withIdTiebreaker", () => {
  it("appends id asc", () => {
    expect(withIdTiebreaker([{ price: "asc" }])).toEqual([
      { price: "asc" },
      { id: "asc" },
    ]);
  });

  it("is idempotent when already ending with id", () => {
    const order = [{ createdAt: "desc" }, { id: "asc" }];
    expect(withIdTiebreaker(order)).toEqual(order);
  });

  it("does not mutate the input", () => {
    const order = [{ price: "asc" }];
    withIdTiebreaker(order);
    expect(order).toEqual([{ price: "asc" }]);
  });
});
