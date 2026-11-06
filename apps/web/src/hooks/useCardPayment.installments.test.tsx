// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallmentOptionsResponse } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The single-page checkout's card form with installments (ADR 0019, plan
 * 5.1): before the cart group exists the options are priced for the goods
 * total (`amount`, display only); the first submit creates the payment and
 * from then on the options are priced for it (`paymentId`). Pins: the signed
 * `expectedTotal` is the total the buyer saw, a drift is priced again for the
 * created payment before anything can be paid, and no call to our API holds
 * more than the BIN.
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

import CardPaymentSection from "@/components/payment/CardPaymentSection";
import { useCardPayment, type ResolvedPayment } from "./useCardPayment";

const CARD_NUMBER = "4355084355084358"; // PayTR's public test card
const BIN = CARD_NUMBER.slice(0, 8);
const ANSWER: InstallmentOptionsResponse = {
  enabled: true,
  card: { bank: "Test Bank", family: "world", type: "credit" },
  baseAmount: 1000,
  options: [
    { count: 1, totalAmount: 1000, feeAmount: 0, monthlyAmount: 1000 },
    { count: 3, totalAmount: 1066.38, feeAmount: 66.38, monthlyAmount: 355.46 },
  ],
};
const REPRICED: InstallmentOptionsResponse = {
  ...ANSWER,
  options: [
    ANSWER.options[0],
    { count: 3, totalAmount: 1070, feeAmount: 70, monthlyAmount: 356.67 },
  ],
};
const FORM = {
  data: {
    paymentId: "pay-new",
    action: "https://www.paytr.com/odeme",
    method: "POST",
    fields: [{ name: "merchant_oid", value: "OID1" }],
    requireCvv: true,
    savedCard: false,
    status: "pending",
  },
};
const CREATED: ResolvedPayment = {
  paymentId: "pay-new",
  target: { checkoutGroupId: "group-1" },
};
const refusal = (status: number, i18nKey: string) => ({
  response: { status, data: { message: `msg:${i18nKey}`, i18nKey } },
});

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let card: ReturnType<typeof useCardPayment>;
const resolvePayment = vi.fn();
const onPaymentOutdated = vi.fn();

function Checkout() {
  card = useCardPayment({
    purpose: "checkout",
    cardStorageEnabled: false,
    resolvePayment,
    distanceSalesAccepted: true,
    // CheckoutContext: no payment yet, priced by the quote's goods total.
    installments: { gate: "on", minAmount: 500, amount: 1000 },
    onPaymentOutdated,
  });
  return <CardPaymentSection card={card} />;
}

const flush = async (ms = 350) => {
  for (const wait of [10, ms, 10, 50]) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, wait));
    });
  }
};
const q = (selector: string) => container.querySelector(selector);
const click = (el: Element | null) => act(() => (el as HTMLElement).click());
const option = (count: number) =>
  q(`[data-testid="installment-option-${count}"] input`) as HTMLInputElement;
const sentBody = (call = 0) => h.prepareDirectForm.mock.calls[call][0];
// Started inside a sync act: React renders between the steps of the submit,
// as in the browser (an awaited act would hold every render until the end).
const submit = () =>
  act(() => {
    void card.submit();
  });

function type(autocomplete: string, value: string) {
  const input = q(`input[autocomplete="${autocomplete}"]`) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function fillNewCard() {
  type("cc-name", "PAYTR TEST");
  type("cc-number", CARD_NUMBER);
  type("cc-exp", "1230");
  type("cc-csc", "000");
  await flush();
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient();
  resolvePayment.mockResolvedValue(CREATED);
  h.listCards.mockResolvedValue({ data: [] });
  h.installmentOptions.mockResolvedValue({ data: ANSWER });
  h.prepareDirectForm.mockResolvedValue(FORM);
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(
    h.formSubmit,
  );
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Checkout />
      </QueryClientProvider>,
    ),
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

describe("useCardPayment on the single-page checkout (installments)", () => {
  it("signs the total the buyer saw for the goods total; a drift is priced again for the created payment", async () => {
    await fillNewCard();
    // Before the order: the goods total, display only.
    expect(h.installmentOptions).toHaveBeenCalledTimes(1);
    expect(h.installmentOptions.mock.calls[0][0]).toEqual({
      bin: BIN,
      amount: 1000,
    });

    click(option(3));
    expect(card.installments.chosen?.totalAmount).toBe(1066.38);

    let answer: (value: unknown) => void = () => {};
    // Like the network: the refusal comes after React rendered the created
    // payment's id.
    h.prepareDirectForm.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) =>
          setTimeout(
            () =>
              reject(refusal(409, "server.payment.installmentPricingChanged")),
            20,
          ),
        ),
    );
    h.installmentOptions.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    submit();
    await flush(10);

    // The first submit created the payment and signed what was shown.
    expect(resolvePayment).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({
      checkoutGroupId: "group-1",
      paymentId: "pay-new",
      saveCard: false,
      distanceSalesAccepted: true,
      installment: { count: 3, bin: BIN, expectedTotal: 1066.38 },
    });
    expect(h.formSubmit).not.toHaveBeenCalled();

    // From now on the created payment is priced, never the amount again.
    const later = h.installmentOptions.mock.calls.slice(1).map((c) => c[0]);
    expect(later.length).toBeGreaterThan(0);
    for (const body of later) {
      expect(body).toEqual({ bin: BIN, paymentId: "pay-new" });
    }

    // While that price loads nothing is payable, not even by a direct submit.
    expect(card.installments.pending).toBe(true);
    expect(card.installments.chosen).toBeNull();
    submit();
    await flush(10);
    expect(h.prepareDirectForm).toHaveBeenCalledTimes(1);

    await act(async () => answer({ data: REPRICED }));
    await flush(10);
    expect(card.installments.pending).toBe(false);
    expect(card.installments.chosen?.totalAmount).toBe(1070);
    expect(option(3).checked).toBe(true);

    submit();
    await flush(10);
    expect(h.prepareDirectForm).toHaveBeenCalledTimes(2);
    expect(sentBody(1)).toMatchObject({
      paymentId: "pay-new",
      installment: { count: 3, bin: BIN, expectedTotal: 1070 },
    });
    expect(h.formSubmit).toHaveBeenCalledTimes(1);

    // PCI: no call to our API carries the number, the expiry or the CVV.
    const apiPayloads = JSON.stringify([
      ...h.installmentOptions.mock.calls.map((c) => c[0]),
      ...h.prepareDirectForm.mock.calls.map((c) => c[0]),
    ]);
    expect(apiPayloads).not.toContain(CARD_NUMBER);
    expect(apiPayloads).not.toMatch(/\d{9,}/);
    expect(apiPayloads).not.toMatch(/cvv|cvc|expiry|1230|"000"/);
  });

  it("an out-of-date amount hands the created payment to the checkout once", async () => {
    await fillNewCard();
    click(option(3));
    h.prepareDirectForm.mockRejectedValueOnce(
      refusal(409, "server.payment.paymentAmountOutOfDate"),
    );
    submit();
    await flush(10);

    expect(h.toast.error).toHaveBeenCalledWith(
      "msg:server.payment.paymentAmountOutOfDate",
    );
    expect(onPaymentOutdated).toHaveBeenCalledTimes(1);
    expect(onPaymentOutdated).toHaveBeenCalledWith(CREATED);
    expect(h.prepareDirectForm).toHaveBeenCalledTimes(1);
    expect(h.formSubmit).not.toHaveBeenCalled();
  });
});
