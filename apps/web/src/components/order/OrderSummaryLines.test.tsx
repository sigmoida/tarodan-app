// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}${JSON.stringify(values)}` : key,
}));

import OrderSummaryLines from "./OrderSummaryLines";

const AMOUNTS = {
  productAmount: 900,
  shippingAmount: 60,
  serviceFeeAmount: 40,
  total: 1000,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

describe("OrderSummaryLines with a chosen installment (checkout)", () => {
  it("without one: the total is the goods total and there is no fee line", () => {
    act(() => root.render(<OrderSummaryLines amounts={AMOUNTS} />));
    expect(container.textContent).toContain("1.000,00 TL");
    expect(container.textContent).not.toContain(
      "payment.summary.installmentFee",
    );
  });

  it("with one: a fee line, the total is C and the monthly amount is shown", () => {
    act(() =>
      root.render(
        <OrderSummaryLines
          amounts={AMOUNTS}
          installment={{
            count: 3,
            totalAmount: 1066.38,
            feeAmount: 66.38,
            monthlyAmount: 355.46,
          }}
        />,
      ),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("payment.summary.installmentFee66,38 TL");
    expect(text).toContain("checkout.total1.066,38 TL");
    expect(text).toContain(
      'payment.installments.monthly{"count":3,"amount":"355,46 TL"}',
    );
  });

  it("a count without a fee says so", () => {
    act(() =>
      root.render(
        <OrderSummaryLines
          amounts={AMOUNTS}
          installment={{
            count: 2,
            totalAmount: 1000,
            feeAmount: 0,
            monthlyAmount: 500,
          }}
        />,
      ),
    );
    expect(container.textContent).toContain(
      "payment.summary.installmentFeepayment.installments.noFee",
    );
  });
});
