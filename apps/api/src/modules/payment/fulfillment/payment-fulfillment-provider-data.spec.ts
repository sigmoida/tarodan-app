import {
  PaymentFulfillmentService,
  providerPaymentDataOf,
} from "./payment-fulfillment.service";

/**
 * Pins how PayTR's payment-method data becomes `Payment` columns when a
 * payment is completed (callback `installment_count` or inquiry `taksit`):
 * `installmentCount` 1 = single payment (PayTR reports 0, or 1), N = N
 * installments; `Payment.currency` is never overwritten ("TL" is not ISO).
 */
describe("PaymentFulfillmentService provider data", () => {
  // buildProviderPatch does not use the instance; no dependencies needed.
  const service = Object.create(
    PaymentFulfillmentService.prototype,
  ) as PaymentFulfillmentService;
  const patchOf = (data?: Parameters<typeof providerPaymentDataOf>[0]) =>
    service["buildProviderPatch"](data && providerPaymentDataOf(data));

  it.each([
    [0, 1],
    [1, 1],
    [3, 3],
    [12, 12],
  ])("PayTR count %p -> installmentCount column %p", (count, column) => {
    const { columns, metaPatch } = patchOf({
      paymentType: "card",
      installmentCount: count,
      currency: "TL",
    });
    expect(columns).toEqual({ installmentCount: column });
    expect(metaPatch).toMatchObject({
      paymentMethod: {
        paymentType: "card",
        installmentCount: count,
        currency: "TL",
      },
    });
  });

  it("leaves the column alone when PayTR sent no count", () => {
    const { columns, metaPatch } = patchOf({ currency: "TL" });
    expect(columns).toEqual({});
    expect(metaPatch).toMatchObject({
      paymentMethod: { installmentCount: null, currency: "TL" },
    });
  });

  it("writes nothing without provider data (legacy callers)", () => {
    expect(patchOf(undefined)).toEqual({ columns: {}, metaPatch: null });
  });

  it("maps only the payment-method fields of an inquiry", () => {
    expect(
      providerPaymentDataOf({
        paymentType: "card",
        installmentCount: 6,
        currency: "TL",
        // Extra inquiry fields (amounts, masked_pan) never reach the patch.
        ...({ maskedPan: "455359******6747", paymentTotalTl: 1 } as object),
      }),
    ).toEqual({ paymentType: "card", installmentCount: 6, currency: "TL" });
  });
});
