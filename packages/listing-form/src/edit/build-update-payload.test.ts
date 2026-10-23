import { describe, expect, it } from "vitest";
import { createEmptySaleData } from "../form/sale-data";
import { buildListingUpdatePayload } from "./build-update-payload";
import { emptyEditValues, type EditListingValues } from "./schema";

const values = (price: string): EditListingValues => ({
  ...emptyEditValues,
  title: "Porsche 911",
  categoryId: "category-1",
  price,
});

describe("buildListingUpdatePayload price", () => {
  it.each([
    ["1000", 1000],
    ["1250,50", 1250.5],
    ["1250.50", 1250.5],
    ["0,57", 0.57],
  ])("sends the field text %j as %j", (price, amount) => {
    const payload = buildListingUpdatePayload(
      values(price),
      createEmptySaleData(),
    );
    expect(payload.price).toBe(amount);
  });

  it("reads comma discount amounts against the comma price", () => {
    const payload = buildListingUpdatePayload(values("1250,50"), {
      ...createEmptySaleData(),
      salePrice: "999,90",
    });
    expect(payload).toMatchObject({
      price: 1250.5,
      originalPrice: 1250.5,
      salePrice: 999.9,
    });
  });
});
