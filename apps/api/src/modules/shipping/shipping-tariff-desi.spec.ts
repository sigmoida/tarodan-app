import {
  calculatePackageDesi,
  outboundPackageShipping,
  ShippingDesiRateNotFoundError,
} from "./shipping-tariff.helper";
import { buildStandardGonderiPayload } from "../surat-cargo/surat-address.util";

describe("desi-based shipping pricing", () => {
  const desiTariff = {
    outboundPackageFee: 99,
    freeShippingEnabled: false,
    freeShippingThreshold: 0,
    rates: [
      { desi: 1, amount: 130 },
      { desi: 2, amount: 180 },
      { desi: 3, amount: 230 },
    ],
  };

  it("uses the admin-defined exact desi amount", () => {
    expect(outboundPackageShipping(desiTariff, 500, 2).toNumber()).toBe(180);
  });

  it("keeps the free-shipping threshold authoritative", () => {
    expect(
      outboundPackageShipping(
        {
          ...desiTariff,
          freeShippingEnabled: true,
          freeShippingThreshold: 500,
        },
        500,
        3,
      ).toNumber(),
    ).toBe(0);
  });

  it("fails closed when an active desi tariff has no matching row", () => {
    expect(() => outboundPackageShipping(desiTariff, 500, 4)).toThrow(
      ShippingDesiRateNotFoundError,
    );
  });

  it("fails closed when a legacy tariff has no desi rows", () => {
    expect(() =>
      outboundPackageShipping(
        {
          outboundPackageFee: 75,
          freeShippingEnabled: false,
          freeShippingThreshold: 0,
          rates: [],
        },
        500,
        1,
      ),
    ).toThrow(ShippingDesiRateNotFoundError);
  });

  it("sums product desi multiplied by quantity for one seller package", () => {
    expect(
      calculatePackageDesi([
        { shippingDesi: 2, quantity: 2 },
        { shippingDesi: 1, quantity: 1 },
      ]),
    ).toBe(5);
  });

  it("writes the snapshotted package desi into the Surat payload", () => {
    const payload = buildStandardGonderiPayload({
      recipientName: "Test Buyer",
      address: "Test Address",
      city: "Istanbul",
      district: "Kadikoy",
      phone: "5551112233",
      ref: "ORDER-1",
      desi: 3,
    });

    expect(payload.BirimDesi).toBe(3);
  });
});
