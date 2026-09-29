/** @format */

import { describe, expect, it } from "vitest";
import { paymentCapabilities, type PaymentConfig } from "./payments";

describe("paymentCapabilities", () => {
  const legacy: PaymentConfig = {
    bypassEnabled: false,
    cardStorageEnabled: true,
    recurringEnabled: false,
  };

  it("reads the capabilities of the requested purpose", () => {
    const config: PaymentConfig = {
      ...legacy,
      purposes: {
        checkout: { cardStorageEnabled: false, recurringEnabled: false },
        membership: { cardStorageEnabled: true, recurringEnabled: true },
      },
    };
    expect(paymentCapabilities(config, "checkout")).toEqual({
      cardStorageEnabled: false,
      recurringEnabled: false,
    });
    expect(paymentCapabilities(config, "membership")).toEqual({
      cardStorageEnabled: true,
      recurringEnabled: true,
    });
  });

  it("falls back to the top-level flags when the API predates purposes", () => {
    expect(paymentCapabilities(legacy, "membership")).toEqual({
      cardStorageEnabled: true,
      recurringEnabled: false,
    });
  });
});
