// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentInstallmentFields } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}${JSON.stringify(values)}` : key,
}));

import InstallmentPaidLines from "./InstallmentPaidLines";

let container: HTMLDivElement;
let root: Root;

function rows(payment: PaymentInstallmentFields | null, countOnly = false) {
  act(() =>
    root.render(
      <InstallmentPaidLines
        payment={payment}
        countOnly={countOnly}
        renderRow={(row) => (
          <p data-key={row.key}>
            {row.label}={row.value}
          </p>
        )}
      />,
    ),
  );
  return Array.from(container.querySelectorAll("p")).map(
    (p) => `${p.dataset.key}:${p.textContent}`,
  );
}

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

describe("InstallmentPaidLines (result, My payments, order payment block)", () => {
  it("count, fee and the amount charged of an installment payment", () => {
    expect(
      rows({
        installmentCount: 3,
        installmentFeeAmount: 66.38,
        chargedAmount: 1066.38,
        cardFamily: "world",
      }),
    ).toEqual([
      'count:payment.summary.installments=payment.installments.count{"count":3}',
      "fee:payment.summary.installmentFee=66,38 TL",
      "charged:payment.summary.chargedTotal=1.066,38 TL",
    ]);
  });

  it("a fee of 0 reads as no installment fee", () => {
    expect(
      rows({
        installmentCount: 3,
        installmentFeeAmount: 0,
        chargedAmount: 1000,
      })[1],
    ).toBe("fee:payment.summary.installmentFee=payment.installments.noFee");
  });

  it("countOnly keeps the count alone", () => {
    expect(
      rows(
        { installmentCount: 6, installmentFeeAmount: 10, chargedAmount: 110 },
        true,
      ),
    ).toEqual([
      'count:payment.summary.installments=payment.installments.count{"count":6}',
    ]);
  });

  it("single payment, older API or the seller's view: nothing", () => {
    expect(
      rows({
        installmentCount: 1,
        installmentFeeAmount: 0,
        chargedAmount: 100,
      }),
    ).toEqual([]);
    expect(rows({})).toEqual([]);
    expect(rows(null)).toEqual([]);
  });
});
