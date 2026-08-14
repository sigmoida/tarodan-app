import { resolveShippingDestinationCity } from "./shipping-destination.util";

describe("resolveShippingDestinationCity (1.11 JSON snapshot)", () => {
  it("uses Address row city when present", () => {
    expect(
      resolveShippingDestinationCity({ city: "Ankara" }, { city: "İzmir" }),
    ).toBe("Ankara");
  });

  it("falls back to JSON when row missing", () => {
    expect(
      resolveShippingDestinationCity(null, {
        city: "İzmir",
        district: "Konak",
      }),
    ).toBe("İzmir");
  });

  it("falls back to JSON when row has empty city", () => {
    expect(
      resolveShippingDestinationCity({ city: "  " }, { city: "Bursa" }),
    ).toBe("Bursa");
  });

  it("uses default when neither has city", () => {
    expect(resolveShippingDestinationCity(null, {})).toBe("Istanbul");
  });
});
