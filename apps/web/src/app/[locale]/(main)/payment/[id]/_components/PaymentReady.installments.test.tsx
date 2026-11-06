// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallmentOptionsResponse } from "@tarodan/types";
import type { PaymentKind } from "@/lib/paymentKind";
import type { PaymentTarget } from "@/hooks/useCardPayment";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The payment page with installments (ADR 0019, plan 6.2): the real card
 * section, so a typed card number goes through the same path as in the
 * browser. Pins: only the BIN reaches our API, the `installment` sent with
 * direct-form, the summary and the pre-information next to the consent, and
 * the 409 / 400 refusals.
 */

const h = vi.hoisted(() => ({
  prepareDirectForm: vi.fn(),
  installmentOptions: vi.fn(),
  listCards: vi.fn(),
  formSubmit: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}${JSON.stringify(values)}` : key;
  t.rich = (key: string, values: Record<string, unknown> = {}) =>
    createElement(
      Fragment,
      null,
      key,
      ...Object.values(values)
        .filter((v) => typeof v === "function")
        .map((render) => (render as (c: ReactNode) => ReactNode)("link")),
    );
  return { useTranslations: () => t };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/lib/api", () => ({
  paymentsApi: {
    prepareDirectForm: h.prepareDirectForm,
    installmentOptions: h.installmentOptions,
  },
  membershipApi: { listCards: h.listCards },
}));
vi.mock("@/components/ui", () => ({
  SectionCard: ({
    children,
    action,
  }: {
    children: ReactNode;
    action?: ReactNode;
  }) => createElement("section", null, action, children),
}));

import PaymentReady from "./PaymentReady";

const ON = { enabled: true, minAmount: 500 };
const CARD_NUMBER = "4355084355084358"; // PayTR's public test card
const SAVED_CARD = {
  id: "card-1",
  last4: "4358",
  brand: "world",
  bank: "Test Bank",
  cardType: "credit",
  cardScheme: null,
  businessCard: false,
  expMonth: "12",
  expYear: "30",
  requireCvv: false,
};
const ANSWER: InstallmentOptionsResponse = {
  enabled: true,
  card: { bank: "Test Bank", family: "world", type: "credit" },
  baseAmount: 1000,
  options: [
    { count: 1, totalAmount: 1000, feeAmount: 0, monthlyAmount: 1000 },
    { count: 3, totalAmount: 1066.38, feeAmount: 66.38, monthlyAmount: 355.46 },
    {
      count: 6,
      totalAmount: 1142.22,
      feeAmount: 142.22,
      monthlyAmount: 190.37,
    },
  ],
};
const FORM = {
  data: {
    paymentId: "pay-1",
    action: "https://www.paytr.com/odeme",
    method: "POST",
    fields: [{ name: "merchant_oid", value: "OID1" }],
    requireCvv: false,
    savedCard: true,
    status: "pending",
  },
};
const refusal = (status: number, i18nKey: string) => ({
  response: { status, data: { message: `msg:${i18nKey}`, i18nKey } },
});

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const onPaymentOutdated = vi.fn();

function render({
  kind = "checkout",
  target = { orderId: "order-1" },
  amount = 1000,
  config = ON,
  cardStorage = true,
}: {
  kind?: PaymentKind;
  target?: PaymentTarget;
  amount?: number;
  config?: { enabled: boolean; minAmount: number };
  cardStorage?: boolean;
} = {}) {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <PaymentReady
          target={target}
          paymentId="pay-1"
          kind={kind}
          amount={amount}
          cardStorageEnabled={cardStorage}
          installmentsConfig={config}
          onPaymentOutdated={onPaymentOutdated}
          hasTarget
          onCancel={vi.fn()}
          cancelling={false}
          retry={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  );
}

/**
 * Several acts: React applies an update when its act ends, so a chain (saved
 * cards load -> 300 ms debounce -> the options answer) needs one act per step.
 */
const flush = async (ms = 350) => {
  for (const wait of [10, ms, 10, ms === 10 ? 10 : 50]) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, wait));
    });
  }
};
const q = (selector: string) => container.querySelector(selector);
const text = () => container.textContent ?? "";
const click = (el: Element | null) => act(() => (el as HTMLElement).click());
function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(label),
  );
  if (!found) throw new Error(`no button ${label}`);
  return found as HTMLButtonElement;
}
const payButton = () => button("checkout.payNow");
const consent = () =>
  q('input[type="checkbox"]:not([disabled])') as HTMLInputElement;
const option = (count: number) =>
  q(`[data-testid="installment-option-${count}"] input`) as HTMLInputElement;
const sentBody = (call = 0) => h.prepareDirectForm.mock.calls[call][0];

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function inputByAutocomplete(value: string): HTMLInputElement {
  const el = q(`input[autocomplete="${value}"]`);
  if (!el) throw new Error(`no input ${value}`);
  return el as HTMLInputElement;
}
async function fillNewCard() {
  type(inputByAutocomplete("cc-name"), "PAYTR TEST");
  type(inputByAutocomplete("cc-number"), CARD_NUMBER);
  type(inputByAutocomplete("cc-exp"), "1230");
  type(inputByAutocomplete("cc-csc"), "000");
  await flush();
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient();
  h.listCards.mockResolvedValue({ data: [SAVED_CARD] });
  h.installmentOptions.mockResolvedValue({ data: ANSWER });
  h.prepareDirectForm.mockResolvedValue(FORM);
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(
    h.formSubmit,
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
  document.querySelectorAll("form").forEach((f) => f.remove());
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("PaymentReady installments: when the selector shows", () => {
  it("switch off: no selector and no options call; pays as before", async () => {
    render({ config: { enabled: false, minAmount: 0 } });
    await flush();
    expect(q('[data-testid="installment-options"]')).toBeNull();
    expect(text()).not.toContain("payment.installments.title");
    expect(h.installmentOptions).not.toHaveBeenCalled();

    click(consent());
    click(payButton());
    await flush(10);
    expect(sentBody()).not.toHaveProperty("installment");
  });

  it.each<[string, { kind?: PaymentKind; target?: PaymentTarget }]>([
    ["membership", { kind: "membership" }],
    ["boost", { kind: "boost" }],
    ["trade cash", { target: { tradeId: "trade-1" } }],
  ])("%s: never a selector (D6)", async (_name, props) => {
    render(props);
    await flush();
    expect(text()).not.toContain("payment.installments.title");
    expect(h.installmentOptions).not.toHaveBeenCalled();
  });

  it("below the minimum: the note, no call, single payment payable", async () => {
    render({ amount: 499 });
    await flush();
    expect(q('[data-testid="installment-note"]')?.textContent).toBe(
      'payment.installments.belowMinimum{"amount":"500,00 TL"}',
    );
    expect(h.installmentOptions).not.toHaveBeenCalled();
    click(consent());
    expect(payButton().disabled).toBe(false);
  });
});

describe("PaymentReady installments: saved card", () => {
  it("prices the saved card by id and sends the chosen count without a BIN", async () => {
    render();
    await flush();
    expect(h.installmentOptions).toHaveBeenCalledTimes(1);
    expect(h.installmentOptions.mock.calls[0][0]).toEqual({
      savedCardId: "card-1",
      paymentId: "pay-1",
    });
    expect(option(1).checked).toBe(true);

    click(option(3));
    // Summary: the amount due is the total C, the fee has its line.
    const summary = q('[data-testid="installment-summary"]')?.textContent ?? "";
    expect(summary).toContain("payment.summary.installmentFee");
    expect(summary).toContain("66,38 TL");
    expect(text()).toContain("1.066,38");
    // Pre-information next to the consent (AS-L1).
    expect(q('[data-testid="installment-terms"]')?.textContent).toContain(
      '"total":"1.066,38 TL"',
    );

    click(consent());
    click(payButton());
    await flush(10);
    expect(sentBody()).toEqual({
      orderId: "order-1",
      paymentId: "pay-1",
      savedCardId: "card-1",
      distanceSalesAccepted: true,
      installment: { count: 3, expectedTotal: 1066.38 },
    });
    expect(h.formSubmit).toHaveBeenCalledTimes(1);
  });

  it("single payment (the default) sends no installment field", async () => {
    render();
    await flush();
    expect(q('[data-testid="installment-terms"]')).toBeNull();
    click(consent());
    click(payButton());
    await flush(10);
    expect(sentBody()).not.toHaveProperty("installment");
  });
});

describe("PaymentReady installments: new card (PCI)", () => {
  it("only the first 8 digits reach our API; the number goes only to PayTR", async () => {
    render({ cardStorage: false });
    await flush();
    expect(q('[data-testid="installment-note"]')?.textContent).toBe(
      "payment.installments.enterCard",
    );
    expect(h.installmentOptions).not.toHaveBeenCalled();

    await fillNewCard();
    expect(h.installmentOptions).toHaveBeenCalledTimes(1);
    expect(h.installmentOptions.mock.calls[0][0]).toEqual({
      bin: CARD_NUMBER.slice(0, 8),
      paymentId: "pay-1",
    });

    click(option(6));
    click(consent());
    click(payButton());
    await flush(10);

    const body = sentBody();
    expect(body.installment).toEqual({
      count: 6,
      bin: CARD_NUMBER.slice(0, 8),
      expectedTotal: 1142.22,
    });
    // No call to our API carries the card number, expiry or CVV.
    const apiPayloads = JSON.stringify([
      ...h.installmentOptions.mock.calls.map((c) => c[0]),
      ...h.prepareDirectForm.mock.calls.map((c) => c[0]),
    ]);
    expect(apiPayloads).not.toContain(CARD_NUMBER);
    expect(apiPayloads).not.toMatch(/\d{9,}/);
    expect(apiPayloads).not.toContain("cvv");
    // The PayTR form carries the card.
    const posted = document.querySelector(
      'form[action="https://www.paytr.com/odeme"]',
    );
    expect(
      (posted?.querySelector('input[name="card_number"]') as HTMLInputElement)
        ?.value,
    ).toBe(CARD_NUMBER);
  });
});

describe("PaymentReady installments: refusals at signing", () => {
  async function chooseThreeAndPay() {
    render();
    await flush();
    click(option(3));
    click(consent());
    click(payButton());
    await flush(10);
  }

  it("409 pricingChanged: toast, options read again, the count stays to re-confirm", async () => {
    h.prepareDirectForm.mockRejectedValueOnce(
      refusal(409, "server.payment.installmentPricingChanged"),
    );
    h.installmentOptions
      .mockResolvedValueOnce({ data: ANSWER })
      .mockResolvedValueOnce({
        data: {
          ...ANSWER,
          options: [
            ANSWER.options[0],
            {
              count: 3,
              totalAmount: 1070,
              feeAmount: 70,
              monthlyAmount: 356.67,
            },
          ],
        },
      });
    await chooseThreeAndPay();
    await flush(10);

    expect(h.toast.error).toHaveBeenCalledWith(
      "msg:server.payment.installmentPricingChanged",
    );
    expect(h.formSubmit).not.toHaveBeenCalled();
    expect(h.installmentOptions).toHaveBeenCalledTimes(2);
    expect(option(3).checked).toBe(true);
    expect(q('[data-testid="installment-terms"]')?.textContent).toContain(
      '"total":"1.070,00 TL"',
    );

    click(payButton());
    await flush(10);
    expect(sentBody(1).installment).toEqual({ count: 3, expectedTotal: 1070 });
  });

  it("409 unavailable: back to the single payment with the note", async () => {
    h.prepareDirectForm.mockRejectedValueOnce(
      refusal(409, "server.payment.installmentUnavailable"),
    );
    h.installmentOptions
      .mockResolvedValueOnce({ data: ANSWER })
      .mockResolvedValueOnce({
        data: {
          enabled: false,
          reason: "unavailable",
          baseAmount: 1000,
          options: [ANSWER.options[0]],
        },
      });
    await chooseThreeAndPay();
    await flush(10);

    expect(h.toast.error).toHaveBeenCalledWith(
      "msg:server.payment.installmentUnavailable",
    );
    expect(q('[data-testid="installment-note"]')?.textContent).toBe(
      "payment.installments.unavailable",
    );
    expect(q('[data-testid="installment-terms"]')).toBeNull();
    click(payButton());
    await flush(10);
    expect(sentBody(1)).not.toHaveProperty("installment");
  });

  it("400 notOffered: the count is not offered again for this card", async () => {
    h.prepareDirectForm.mockRejectedValueOnce(
      refusal(400, "server.payment.installmentNotOffered"),
    );
    await chooseThreeAndPay();
    await flush(10);

    expect(h.toast.error).toHaveBeenCalledWith(
      "msg:server.payment.installmentNotOffered",
    );
    expect(option(3)).toBeNull();
    expect(option(6)).not.toBeNull();
    expect(option(1).checked).toBe(true);
  });

  it("409 paymentAmountOutOfDate: the server message, then the page starts the payment anew", async () => {
    h.prepareDirectForm.mockRejectedValueOnce(
      refusal(409, "server.payment.paymentAmountOutOfDate"),
    );
    await chooseThreeAndPay();

    expect(h.toast.error).toHaveBeenCalledWith(
      "msg:server.payment.paymentAmountOutOfDate",
    );
    expect(onPaymentOutdated).toHaveBeenCalledTimes(1);
    expect(h.formSubmit).not.toHaveBeenCalled();
  });

  it("an options failure falls back to the single payment, still payable", async () => {
    h.installmentOptions.mockRejectedValueOnce({ response: { status: 429 } });
    render();
    await flush();
    expect(q('[data-testid="installment-note"]')?.textContent).toBe(
      "payment.installments.unavailable",
    );
    click(consent());
    expect(payButton().disabled).toBe(false);
  });
});
