import { withEsIdTiebreaker } from "./es-id-tiebreaker";

describe("withEsIdTiebreaker", () => {
  it("appends id asc", () => {
    expect(withEsIdTiebreaker([{ price: "asc" }])).toEqual([
      { price: "asc" },
      { id: "asc" },
    ]);
  });

  it("does not duplicate an existing id sort", () => {
    const sort = [{ price: "asc" }, { id: "asc" }];
    expect(withEsIdTiebreaker(sort)).toEqual(sort);
  });
});
