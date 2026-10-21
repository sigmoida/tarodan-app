import { paymentReturnQuery } from "./payment-return-query";

describe("paymentReturnQuery", () => {
  it.each([
    ["a member checkout", { paymentId: "pay-1" }, "paymentId=pay-1"],
    [
      "a guest checkout",
      { paymentId: "pay-1", guest: true },
      "paymentId=pay-1&guest=true",
    ],
    [
      "a membership purchase",
      { paymentId: "pay-1", kind: "membership" as const },
      "paymentId=pay-1&type=membership",
    ],
    [
      "a boost purchase",
      { paymentId: "pay-1", kind: "boost" as const },
      "paymentId=pay-1&type=boost",
    ],
    [
      "a trade cash payment",
      { paymentId: "pay-1", kind: null, guest: false },
      "paymentId=pay-1",
    ],
  ])("%s", (_label, input, expected) => {
    expect(paymentReturnQuery(input)).toBe(expected);
  });

  it("encodes the payment id", () => {
    expect(paymentReturnQuery({ paymentId: "a&b=c" })).toBe(
      "paymentId=a%26b%3Dc",
    );
  });
});
