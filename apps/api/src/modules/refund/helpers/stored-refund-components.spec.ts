import { storedComponentsOf } from "./stored-refund-components";

describe("storedComponentsOf", () => {
  it("returns the included components", () => {
    const components = [
      {
        componentCode: "outbound_shipping",
        treatment: "buyer_charge",
        netAmount: 40,
        grossAmount: 48,
      },
    ];
    expect(
      storedComponentsOf({ id: "rr-1", financialComponents: components }),
    ).toBe(components);
  });

  it("is null when the row was read without them", () => {
    expect(storedComponentsOf({ id: "rr-1" })).toBeNull();
    expect(
      storedComponentsOf({ id: "rr-1", financialComponents: null }),
    ).toBeNull();
  });
});
